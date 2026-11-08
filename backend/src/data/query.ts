import { QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { documentClient } from '../core/table.js';

export async function queryAll<T>(input: QueryCommandInput): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await documentClient.send(
      new QueryCommand({ ...input, ExclusiveStartKey: startKey }),
    );
    items.push(...((page.Items ?? []) as T[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}
