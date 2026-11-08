import { readFileSync } from 'node:fs';

export { loadOutputs } from '../scripts/outputs.js';

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/${path}`, import.meta.url), 'utf8'));
}

let passed = 0;
let failed = 0;

export function check(name: string, ok: boolean, extra?: unknown): void {
  if (ok) {
    passed++;
  } else {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(extra)}`);
}

export function finish(): never {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

export async function deletePartitions(
  region: string,
  tableName: string,
  partitionKeys: string[],
): Promise<void> {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } = await import(
    '@aws-sdk/lib-dynamodb'
  );
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  for (const partitionKey of partitionKeys) {
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await documentClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': partitionKey },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: startKey,
        }),
      );
      const items = page.Items ?? [];
      for (let start = 0; start < items.length; start += 25) {
        await documentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tableName]: items.slice(start, start + 25).map((item) => ({
                DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
              })),
            },
          }),
        );
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
  }
}
