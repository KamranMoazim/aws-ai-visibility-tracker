import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isConditionFailure } from '../core/dynamo-errors.js';
import { gapIndexPk, gapSk, scoreSk, workspacePk } from '../core/keys.js';
import type { PromptRecord } from '../core/schemas.js';
import { documentClient, GSI1, TABLE_NAME } from '../core/table.js';
import type { Brief } from '../gaps/brief.js';
import type { Evidence } from '../gaps/evidence.js';

export type GapStatus = 'pending' | 'open' | 'dismissed' | 'drafted' | 'failed';

export interface Gap {
  gapId: string;
  workspaceId: string;
  promptId: string;
  promptText: string;
  stage: PromptRecord['stage'];
  runId?: string;
  status: GapStatus;
  score: number;
  missingEngines: string[];
  missingRate: number;
  neverCited: boolean;
  evidence?: Omit<Evidence, 'excerpts'>;
  sourcesRead?: { url: string; title?: string; ok: boolean; error?: string }[];
  ownPages?: { url: string; title?: string }[];
  brief?: Brief;
  briefModel?: string;
  briefUsage?: { inputTokens: number; outputTokens: number };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const keyOf = (workspaceId: string, gapId: string) => ({
  PK: workspacePk(workspaceId),
  SK: gapSk(gapId),
});

export async function getGap(workspaceId: string, gapId: string): Promise<Gap | undefined> {
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keyOf(workspaceId, gapId) }),
  );
  if (!Item) {
    return undefined;
  }
  const { PK, SK, GSI1PK, GSI1SK, ...gap } = Item;
  return gap as Gap;
}

export async function putGap(gap: Gap): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keyOf(gap.workspaceId, gap.gapId),
        GSI1PK: gapIndexPk(gap.workspaceId, gap.status),
        GSI1SK: scoreSk(gap.score),
        ...gap,
      },
    }),
  );
}

export async function listGaps(workspaceId: string, status: GapStatus, limit = 50): Promise<Gap[]> {
  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': gapIndexPk(workspaceId, status) },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return Items.map(({ PK, SK, GSI1PK, GSI1SK, ...gap }) => gap as Gap);
}

export async function setGapStatus(
  workspaceId: string,
  gapId: string,
  from: GapStatus[],
  to: GapStatus,
): Promise<boolean> {
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keyOf(workspaceId, gapId),
        UpdateExpression: 'SET #status = :to, GSI1PK = :index, updatedAt = :now',
        ConditionExpression: `#status IN (${from.map((_, index) => `:from${index}`).join(', ')})`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':to': to,
          ':index': gapIndexPk(workspaceId, to),
          ':now': new Date().toISOString(),
          ...Object.fromEntries(from.map((status, index) => [`:from${index}`, status])),
        },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) {
      return false;
    }
    throw error;
  }
}
