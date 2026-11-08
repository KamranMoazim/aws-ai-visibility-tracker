import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  ALL_PROMPTS,
  METRIC_PREFIX,
  metricSk,
  workspaceMetricsPk,
  workspaceMetricsSk,
  workspacePk,
} from '../core/keys.js';
import { ratesOf, topEntries, type Counts } from '../core/metrics.js';
import { documentClient, GSI1, TABLE_NAME } from '../core/table.js';
import { queryAll } from './query.js';

const BATCH_SIZE = 25;
const TOP_DOMAINS = 20;
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
      citedDomains: topEntries(counts.citedDomains, TOP_DOMAINS),
      ...ratesOf(counts),
    };
  });
  await batchPut(items);
}

export interface TrendPoint extends Counts {
  runId: string;
  engine: string;
  at: string;
  mentionRate: number | null;
  firstMentionRate: number | null;
  averagePosition: number | null;
  shareOfVoice: number | null;
  recommendedRate: number | null;
  citationRate: number | null;
}

export async function listWorkspaceTrend(
  workspaceId: string,
  from: string,
  to: string,
): Promise<TrendPoint[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    IndexName: GSI1,
    KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': workspaceMetricsPk(workspaceId),
      ':from': from,
      ':to': `${to}~`,
    },
  });
  return items.map(({ PK, SK, GSI1PK, GSI1SK, ...point }) => point as unknown as TrendPoint);
}

export async function listPromptTrend(
  workspaceId: string,
  promptId: string,
): Promise<TrendPoint[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': workspacePk(workspaceId),
      ':prefix': `${METRIC_PREFIX}${promptId}#`,
    },
  });
  return items
    .map(({ PK, SK, GSI1PK, GSI1SK, ...point }) => point as unknown as TrendPoint)
    .sort((left, right) => left.at.localeCompare(right.at));
}
