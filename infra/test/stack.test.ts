import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AnswerShareStack } from '../lib/answershare-stack.js';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra?: unknown): void {
  if (ok) {
    passed++;
  } else {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(extra)}`);
}

const stack = new AnswerShareStack(new App(), 'TestStack', {
  env: { account: '111111111111', region: 'us-east-1' },
  alertEmail: 'alerts@example.com',
  maxCallsPerRun: 300,
  openAiModel: 'gpt-5-mini',
});
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources as Record<
  string,
  { Type: string; DeletionPolicy?: string; Properties: any }
>;
const ofType = (type: string) =>
  Object.values(resources).filter((resource) => resource.Type === type);
const json = (value: unknown) => JSON.stringify(value);

const [table] = ofType('AWS::DynamoDB::GlobalTable');
const tableProps = table?.Properties ?? {};
check(
  'table on demand with PK/SK',
  tableProps.TableName === 'answershare' &&
    tableProps.BillingMode === 'PAY_PER_REQUEST' &&
    json(tableProps.KeySchema) ===
      json([
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ]),
  tableProps,
);
check(
  'ttl on expiresAt',
  tableProps.TimeToLiveSpecification?.AttributeName === 'expiresAt' &&
    tableProps.TimeToLiveSpecification?.Enabled === true,
  tableProps.TimeToLiveSpecification,
);
const indexes = tableProps.GlobalSecondaryIndexes ?? [];
check(
  'one gsi on GSI1PK/GSI1SK',
  indexes.length === 1 &&
    indexes[0].IndexName === 'GSI1' &&
    json(indexes[0].KeySchema) ===
      json([
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ]),
  indexes,
);
check('table is destroyed with the stack', table?.DeletionPolicy === 'Delete', table);
check('no customer kms key', ofType('AWS::KMS::Key').length === 0);

const [bucket] = ofType('AWS::S3::Bucket');
const bucketProps = bucket?.Properties ?? {};
check(
  'raw bucket sse-s3, private, not versioned',
  bucketProps.BucketEncryption?.ServerSideEncryptionConfiguration?.[0]
    ?.ServerSideEncryptionByDefault?.SSEAlgorithm === 'AES256' &&
    bucketProps.PublicAccessBlockConfiguration?.BlockPublicPolicy === true &&
    bucketProps.PublicAccessBlockConfiguration?.RestrictPublicBuckets === true &&
    !bucketProps.VersioningConfiguration,
  bucketProps,
);
check(
  'raw answers expire in 180 days, page text in 30',
  json(bucketProps.LifecycleConfiguration?.Rules).includes(
    json({ ExpirationInDays: 180, Prefix: 'raw/', Status: 'Enabled' }),
  ) &&
    json(bucketProps.LifecycleConfiguration?.Rules).includes(
      json({ ExpirationInDays: 30, Prefix: 'pages/', Status: 'Enabled' }),
    ),
  bucketProps.LifecycleConfiguration,
);
const [bucketPolicy] = ofType('AWS::S3::BucketPolicy');
check(
  'bucket denies non-tls access',
  json(bucketPolicy?.Properties.PolicyDocument).includes('aws:SecureTransport'),
  bucketPolicy?.Properties,
);
check(
  'no vpc, nat or provisioned capacity',
  ofType('AWS::EC2::VPC').length === 0 && ofType('AWS::EC2::NatGateway').length === 0,
);

const appFunctions = ofType('AWS::Lambda::Function').filter(
  (lambdaFunction) => lambdaFunction.Properties.Environment?.Variables?.TABLE_NAME,
);
check(
  'app functions run node 24 on arm64',
  appFunctions.length === 5 &&
    appFunctions.every(
      (lambdaFunction) =>
        lambdaFunction.Properties.Runtime === 'nodejs24.x' &&
        json(lambdaFunction.Properties.Architectures) === json(['arm64']),
    ),
  appFunctions.map((lambdaFunction) => lambdaFunction.Properties.Runtime),
);
const logGroups = ofType('AWS::Logs::LogGroup');
check(
  'log groups keep 7 days and are destroyed',
  logGroups.length >= 6 &&
    logGroups.every(
      (group) => group.Properties.RetentionInDays === 7 && group.DeletionPolicy === 'Delete',
    ),
  logGroups,
);
const functionByEnv = (name: string) =>
  appFunctions.find((lambdaFunction) => lambdaFunction.Properties.Environment.Variables[name]);
check(
  'run cap reaches start-run',
  functionByEnv('MAX_CALLS_PER_RUN')?.Properties.Environment.Variables.MAX_CALLS_PER_RUN === '300',
);

const [stateMachine] = ofType('AWS::StepFunctions::StateMachine');
const definition = json(stateMachine?.Properties.DefinitionString);
const definitionParts = stateMachine?.Properties.DefinitionString['Fn::Join'][1] as unknown[];
const states = JSON.parse(
  definitionParts.map((part) => (typeof part === 'string' ? part : 'TOKEN')).join(''),
);
const branches = states.States.AskEngines.Branches as any[];
const concurrencyOf = (name: string) =>
  branches.find((branch) => branch.StartAt === name)?.States[name].MaxConcurrency;
check(
  'per-engine maps with their own concurrency',
  concurrencyOf('MapOpenAi') === 5 &&
    concurrencyOf('MapNova') === 5 &&
    concurrencyOf('MapSonar') === 3 &&
    concurrencyOf('MapFake') === 10,
  branches.map((branch) => branch.StartAt),
);
check(
  'refused runs stop before asking',
  states.States.Refused.Choices[0].Next === 'RunRefused' &&
    states.States.Refused.Default === 'AskEngines',
  states.States.Refused,
);
check(
  'engine errors retried with backoff',
  definition.includes('EngineRetryableError') && definition.includes('FULL'),
);
check('failed items are recorded, not fatal', definition.includes('RecordOpenAiAskFailure'));
check(
  'state machine logs errors and times out',
  stateMachine?.Properties.LoggingConfiguration?.Level === 'ERROR' &&
    definition.includes('TimeoutSeconds'),
  stateMachine?.Properties.LoggingConfiguration,
);

const statements = ofType('AWS::IAM::Policy').flatMap(
  (policy) => policy.Properties.PolicyDocument.Statement as any[],
);
const withAction = (pattern: RegExp) =>
  statements.filter((statement) =>
    [statement.Action].flat().some((action: string) => pattern.test(action)),
  );
const dataStatements = withAction(/^(dynamodb|s3):/);
check(
  'no wildcard resource on table or bucket',
  dataStatements.length > 0 && dataStatements.every((statement) => statement.Resource !== '*'),
  dataStatements,
);
check(
  'ask may only put raw/ objects',
  withAction(/^s3:PutObject/).every((statement) => json(statement.Resource).includes('/raw/*')),
  withAction(/^s3:PutObject/),
);
const invokeModel = withAction(/^bedrock:InvokeModel$/);
check(
  'bedrock invoke scoped to nova 2 lite',
  invokeModel.length === 2 &&
    invokeModel.every(
      (statement) =>
        json(statement.Resource).includes('nova-2-lite-v1:0') && statement.Resource !== '*',
    ),
  invokeModel,
);
const invokeTool = withAction(/^bedrock:InvokeTool$/);
check(
  'grounding tool only for ask',
  invokeTool.length === 1 &&
    json(invokeTool[0].Resource).includes('system-tool/amazon.nova_grounding'),
  invokeTool,
);
const ssmReads = withAction(/^ssm:/);
check(
  'ssm reads limited to engine keys',
  ssmReads.length === 2 &&
    ssmReads.every(
      (statement) =>
        json(statement.Resource).includes('parameter/answershare/openai-api-key') &&
        json(statement.Resource).includes('parameter/answershare/perplexity-api-key'),
    ),
  ssmReads,
);
const [scheduleGroup] = ofType('AWS::Scheduler::ScheduleGroup');
check('schedule group', scheduleGroup?.Properties.Name === 'answershare', scheduleGroup);
const startExecution = withAction(/^states:StartExecution$/);
check(
  'scheduler may start only the run state machine',
  startExecution.length === 1 && json(startExecution[0].Resource).includes('StateMachine'),
  startExecution,
);

const outputs = Object.keys(template.toJSON().Outputs ?? {});
check(
  'outputs for scripts',
  ['Region', 'TableName', 'RawBucketName', 'StateMachineArn', 'SchedulerRoleArn'].every((name) =>
    outputs.includes(name),
  ),
  outputs,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
