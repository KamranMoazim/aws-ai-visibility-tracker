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

const outputs = Object.keys(template.toJSON().Outputs ?? {});
check(
  'outputs for scripts',
  ['Region', 'TableName', 'RawBucketName'].every((name) => outputs.includes(name)),
  outputs,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
