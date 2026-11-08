import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  ALL_PROMPTS,
  metricSk,
  workspaceMetricsPk,
  workspaceMetricsSk,
  workspacePk,
} from '../core/keys.js';
import { ratesOf, type Counts } from '../core/metrics.js';
import { documentClient, TABLE_NAME } from '../core/table.js';

const BATCH_SIZE = 25;
const MAX_BATCH_ATTEMPTS = 6;

export async function batchPut(items: Record<string, unknown>[]): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    let pending = items.slice(start, start + BATCH_SIZE).map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 1; pending.length; attempt++) {
      if (attempt > MAX_BATCH_ATTEMPTS) {
        throw new Error(`batch write left ${pending.length} unprocessed items`);
      }
      const response = await documentClient.send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: pending } }),
      );
      pending = (response.UnprocessedItems?.[TABLE_NAME] ?? []) as typeof pending;
      if (pending.length) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 50 * 2 ** attempt));
      }
    }
  }
}

export async function writeRollups(
  workspaceId: string,
  runId: string,
  startedAt: string,
  rollups: Map<string, Counts>,
): Promise<void> {
  const items = [...rollups].map(([key, counts]) => {
    const [promptId, engine] = key.split('|');
    return {
      PK: workspacePk(workspaceId),
      SK: metricSk(promptId, engine, startedAt),
      ...(promptId === ALL_PROMPTS
        ? {
            GSI1PK: workspaceMetricsPk(workspaceId),
            GSI1SK: workspaceMetricsSk(startedAt, engine),
          }
        : {}),
      runId,
      promptId,
      engine,
      at: startedAt,
      ...counts,
      ...ratesOf(counts),
    };
  });
  await batchPut(items);
}
