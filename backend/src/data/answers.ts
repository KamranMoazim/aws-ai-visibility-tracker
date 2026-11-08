import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isConditionFailure } from '../core/dynamo-errors.js';
import { answerIndexSk, answerSk, promptIndexPk, runPk } from '../core/keys.js';
import { documentClient, TABLE_NAME, ttlAfterDays } from '../core/table.js';
import type { WorkItem } from '../core/work.js';
import type { Citation } from '../engines/types.js';
import type { Disagreement, Mention } from '../extraction/merge.js';
import { queryAll } from './query.js';

export const ANSWER_TTL_DAYS = 180;
export const MAX_STORED_TEXT = 20_000;

export type AnswerStatus = 'answered' | 'extracted' | 'failed';

export interface AnswerRecord {
  runId: string;
  workspaceId: string;
  promptId: string;
  engine: string;
  sample: number;
  askedAt: string;
  status: AnswerStatus;
  rawKey?: string;
  model?: string;
  text?: string;
  citations?: Citation[];
  searchCalls?: number;
  usage?: { inputTokens: number; outputTokens: number };
  mentions?: Mention[];
  disagreement?: Disagreement;
  extractModel?: string;
  extractUsage?: { inputTokens: number; outputTokens: number };
  extractError?: string;
  error?: string;
}

const keyOf = (item: Pick<WorkItem, 'runId' | 'promptId' | 'engine' | 'sample'>) => ({
  PK: runPk(item.runId),
  SK: answerSk(item.promptId, item.engine, item.sample),
});

const indexOf = (item: WorkItem) => ({
  GSI1PK: promptIndexPk(item.promptId),
  GSI1SK: answerIndexSk(item.startedAt, item.engine, item.sample),
});

export async function getAnswer(item: WorkItem): Promise<AnswerRecord | undefined> {
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keyOf(item), ConsistentRead: true }),
  );
  return Item as AnswerRecord | undefined;
}

export async function putAnswered(
  item: WorkItem,
  fields: Omit<AnswerRecord, 'runId' | 'workspaceId' | 'promptId' | 'engine' | 'sample' | 'status'>,
): Promise<boolean> {
  try {
    await documentClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...keyOf(item),
          ...indexOf(item),
          runId: item.runId,
          workspaceId: item.workspaceId,
          promptId: item.promptId,
          engine: item.engine,
          sample: item.sample,
          status: 'answered',
          ...fields,
          text: fields.text?.slice(0, MAX_STORED_TEXT),
          expiresAt: ttlAfterDays(ANSWER_TTL_DAYS),
        },
        ConditionExpression: 'attribute_not_exists(SK) OR #status = :failed',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':failed': 'failed' },
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

export async function putFailed(item: WorkItem, message: string): Promise<boolean> {
  try {
    await documentClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...keyOf(item),
          ...indexOf(item),
          runId: item.runId,
          workspaceId: item.workspaceId,
          promptId: item.promptId,
          engine: item.engine,
          sample: item.sample,
          askedAt: new Date().toISOString(),
          status: 'failed',
          error: message.slice(0, 1000),
          expiresAt: ttlAfterDays(ANSWER_TTL_DAYS),
        },
        ConditionExpression: 'attribute_not_exists(SK)',
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

export async function markExtracted(
  item: WorkItem,
  fields: Pick<
    AnswerRecord,
    'mentions' | 'disagreement' | 'extractModel' | 'extractUsage' | 'extractError'
  >,
): Promise<boolean> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keyOf(item),
        UpdateExpression: `SET #status = :extracted${entries
          .map(([name]) => `, #${name} = :${name}`)
          .join('')}`,
        ConditionExpression: '#status = :answered',
        ExpressionAttributeNames: {
          '#status': 'status',
          ...Object.fromEntries(entries.map(([name]) => [`#${name}`, name])),
        },
        ExpressionAttributeValues: {
          ':extracted': 'extracted',
          ':answered': 'answered',
          ...Object.fromEntries(entries.map(([name, value]) => [`:${name}`, value])),
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

export async function listRunAnswers(runId: string): Promise<AnswerRecord[]> {
  return queryAll<AnswerRecord>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': runPk(runId) },
  });
}
