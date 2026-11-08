import {
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { newId } from '../src/core/ids.js';
import { getJson, putJson, rawAnswerKey, s3Client } from '../src/core/storage.js';
import { fakeEngine } from '../src/engines/fake.js';
import type { EngineAnswer } from '../src/engines/types.js';
import { check, finish, loadOutputs } from './helpers.js';

const outputs = loadOutputs();
const dynamo = new DynamoDBClient({ region: outputs.Region });

const { Table } = await dynamo.send(new DescribeTableCommand({ TableName: outputs.TableName }));
check(
  'table is active and on demand',
  Table?.TableStatus === 'ACTIVE' && Table?.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST',
  Table,
);
check(
  'gsi1 exists',
  Table?.GlobalSecondaryIndexes?.some((index) => index.IndexName === 'GSI1') === true,
);
const ttl = await dynamo.send(new DescribeTimeToLiveCommand({ TableName: outputs.TableName }));
check('ttl enabled on expiresAt', ttl.TimeToLiveDescription?.AttributeName === 'expiresAt', ttl);

const answer = await fakeEngine().ask('foundation smoke prompt', { sample: 0 });
const key = rawAnswerKey(`test-${newId()}`, 'p-test', 'fake', 0);
await putJson(outputs.RawBucketName, key, { answer });
const stored = await getJson<{ answer: EngineAnswer }>(outputs.RawBucketName, key);
check('raw answer round trips through s3', stored.answer.text === answer.text, stored);
await s3Client.send(new DeleteObjectCommand({ Bucket: outputs.RawBucketName, Key: key }));
finish();
