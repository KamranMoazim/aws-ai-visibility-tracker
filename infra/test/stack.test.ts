import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const distPath = mkdtempSync(join(tmpdir(), 'answershare-dist-'));
writeFileSync(join(distPath, 'index.html'), '<div id="root"></div>');
const stack = new AnswerShareStack(new App(), 'TestStack', {
  env: { account: '111111111111', region: 'us-east-1' },
  alertEmail: 'alerts@example.com',
  maxCallsPerRun: 300,
  openAiModel: 'gpt-5-mini',
  clientDistPath: distPath,
  siteName: 'Acme Pay',
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
  appFunctions.length === 8 &&
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
const rawPuts = withAction(/^s3:PutObject/).filter((statement) =>
  json(statement.Resource).includes('RawBucket'),
);
check(
  'raw bucket writes limited to raw/, pages/ and site/',
  rawPuts.length === 3 &&
    rawPuts.every(
      (statement) =>
        /\/(raw|pages|site)\/\*/.test(json(statement.Resource)) &&
        !json(statement.Resource).includes('"/*"'),
    ) &&
    rawPuts.some((statement) => json(statement.Resource).includes('/pages/*')),
  rawPuts,
);
const invokeModel = withAction(/^bedrock:InvokeModel$/);
check(
  'bedrock invoke scoped to nova 2 lite',
  invokeModel.length === 4 &&
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
const ssmReads = withAction(/^ssm:/).filter((statement) =>
  json(statement.Resource).includes('api-key'),
);
const wordpressReads = withAction(/^ssm:/).filter(
  (statement) => !json(statement.Resource).includes('api-key'),
);
check(
  'wordpress password readable by the publisher only',
  wordpressReads.length === 1 &&
    json(wordpressReads[0].Resource).includes('parameter/answershare/wordpress-app-password'),
  wordpressReads,
);
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
  'only the scheduler and api may start runs, on the run state machine only',
  startExecution.length === 2 &&
    startExecution.every((statement) => json(statement.Resource).includes('StateMachine')),
  startExecution,
);
const scheduleWrites = withAction(/^scheduler:/);
check(
  'api manages schedules in its own group only',
  scheduleWrites.length === 1 &&
    json(scheduleWrites[0].Resource).includes(':schedule/answershare/*'),
  scheduleWrites,
);
const passRole = withAction(/^iam:PassRole$/);
check(
  'api may pass only the scheduler role',
  passRole.length === 1 && json(passRole[0].Resource).includes('SchedulerRole'),
  passRole,
);

const [pool] = ofType('AWS::Cognito::UserPool');
check(
  'user pool is invite only with 12 char passwords',
  pool?.Properties.AdminCreateUserConfig?.AllowAdminCreateUserOnly === true &&
    pool?.Properties.Policies?.PasswordPolicy?.MinimumLength === 12 &&
    pool?.DeletionPolicy === 'Delete',
  pool?.Properties,
);
const [poolClient] = ofType('AWS::Cognito::UserPoolClient');
check(
  'web client is public and hides user existence',
  !poolClient?.Properties.GenerateSecret &&
    poolClient?.Properties.PreventUserExistenceErrors === 'ENABLED',
  poolClient?.Properties,
);
const routes = ofType('AWS::ApiGatewayV2::Route').map((route) => route.Properties);
const proxyRoutes = routes.filter((route) => route.RouteKey.endsWith('/{proxy+}'));
check(
  'api routes need a cognito jwt, without ANY or OPTIONS',
  proxyRoutes.length === 4 &&
    proxyRoutes.every((route) => route.AuthorizationType === 'JWT') &&
    !routes.some((route) => /^(ANY|OPTIONS) /.test(route.RouteKey)),
  routes.map((route) => route.RouteKey),
);
check(
  'health is the only open route',
  routes
    .filter((route) => route.AuthorizationType !== 'JWT')
    .map((route) => route.RouteKey)
    .join() === 'GET /health',
);
const [httpApi] = ofType('AWS::ApiGatewayV2::Api');
const corsOrigins = json(httpApi?.Properties.CorsConfiguration?.AllowOrigins);
check(
  'cors limited to the site and local dev',
  corsOrigins.includes('http://localhost:5173') &&
    corsOrigins.includes('Distribution') &&
    !corsOrigins.includes('"*"') &&
    !corsOrigins.includes('https://*'),
  httpApi?.Properties.CorsConfiguration,
);
const distribution = () =>
  ofType('AWS::CloudFront::Distribution')[0]?.Properties.DistributionConfig;
const siteHeaders = ofType('AWS::CloudFront::ResponseHeadersPolicy').find((policy) =>
  json(policy.Properties).includes("script-src 'self'"),
);
const csp = json(siteHeaders?.Properties);
check(
  'strict csp on the site',
  csp.includes("frame-ancestors 'none'") &&
    csp.includes("script-src 'self'") &&
    !csp.includes('unsafe-inline'),
  siteHeaders?.Properties,
);
check(
  'site served through origin access control',
  ofType('AWS::CloudFront::OriginAccessControl').length === 1 &&
    ofType('AWS::S3::Bucket').every(
      (candidate) =>
        candidate.Properties.PublicAccessBlockConfiguration?.BlockPublicPolicy === true,
    ),
);

const queuesWithDlq = ofType('AWS::SQS::Queue').filter(
  (queue) => queue.Properties.RedrivePolicy?.maxReceiveCount === 3,
);
check(
  'gap queue has a dlq after 3 receives',
  queuesWithDlq.length === 1,
  ofType('AWS::SQS::Queue'),
);
check(
  'queue visibility covers six worker timeouts',
  queuesWithDlq[0]?.Properties.VisibilityTimeout === 1800,
  queuesWithDlq[0]?.Properties,
);
check(
  'queues are tls only',
  ofType('AWS::SQS::QueuePolicy').length === 2 &&
    ofType('AWS::SQS::QueuePolicy').every((policy) =>
      json(policy.Properties).includes('aws:SecureTransport'),
    ),
);
const [gapSource] = ofType('AWS::Lambda::EventSourceMapping');
check(
  'gap worker takes one job at a time and reports partial failures',
  gapSource?.Properties.BatchSize === 1 &&
    json(gapSource?.Properties.FunctionResponseTypes) === json(['ReportBatchItemFailures']) &&
    gapSource?.Properties.ScalingConfig?.MaximumConcurrency === 5,
  gapSource?.Properties,
);
const sends = withAction(/^sqs:SendMessage$/);
check(
  'aggregate and api may send gap jobs',
  sends.length === 2 && sends.every((statement) => json(statement.Resource).includes('GapsQueue')),
  sends,
);

const statementsOfRole = (fragment: string) =>
  ofType('AWS::IAM::Policy')
    .filter((policy) => json(policy.Properties.Roles).includes(fragment))
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement as any[]);
const publisherStatements = statementsOfRole('PublishPublisher');
const siteWrites = publisherStatements.filter((statement) =>
  json(statement.Resource).includes('SiteBucket'),
);
check(
  'publisher writes only guides/ and generated root files on the site',
  siteWrites.length === 1 &&
    ['/guides/*', '/sitemap.xml', '/llms.txt', '/robots.txt'].every((path) =>
      json(siteWrites[0].Resource).includes(path),
    ) &&
    !json(siteWrites[0].Resource).includes('"/*"'),
  siteWrites,
);
const invalidations = publisherStatements.filter((statement) =>
  [statement.Action].flat().includes('cloudfront:CreateInvalidation'),
);
check(
  'invalidation scoped to the site distribution',
  invalidations.length === 1 &&
    json(invalidations[0].Resource).includes(':distribution/') &&
    !publisherStatements.some((statement) => statement.Resource === '*'),
  invalidations,
);
const invokes = statementsOfRole('WebApi').filter((statement) =>
  [statement.Action].flat().includes('lambda:InvokeFunction'),
);
check(
  'api may invoke the publisher',
  invokes.length === 1 && json(invokes[0].Resource).includes('PublishPublisher'),
  invokes,
);
const guidesBehavior = distribution()?.CacheBehaviors?.find(
  (behavior: any) => behavior.PathPattern === 'guides/*',
);
check(
  'guides behavior rewrites to index.html and has its own no-script csp',
  guidesBehavior?.FunctionAssociations?.[0]?.EventType === 'viewer-request' &&
    Boolean(guidesBehavior?.ResponseHeadersPolicyId),
  guidesBehavior,
);
const guideCsp = ofType('AWS::CloudFront::ResponseHeadersPolicy').find((policy) =>
  json(policy.Properties).includes("default-src 'none'"),
);
check(
  'guide pages allow no scripts',
  Boolean(guideCsp) && !json(guideCsp?.Properties).includes('script-src'),
  guideCsp?.Properties,
);
const [deployment] = ofType('Custom::CDKBucketDeployment');
check(
  'site deploy keeps published guides and generated files',
  ['guides/*', 'sitemap.xml', 'llms.txt', 'robots.txt'].every((pattern) =>
    json(deployment?.Properties.Exclude).includes(pattern),
  ),
  deployment?.Properties.Exclude,
);

const outputs = Object.keys(template.toJSON().Outputs ?? {});
check(
  'outputs for scripts',
  [
    'Region',
    'TableName',
    'RawBucketName',
    'StateMachineArn',
    'SchedulerRoleArn',
    'UserPoolId',
    'UserPoolClientId',
    'ApiUrl',
    'SiteUrl',
    'GapQueueUrl',
  ].every((name) => outputs.includes(name)),
  outputs,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
