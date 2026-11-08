import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { EngineId } from '../engines/types.js';
import { RUN_PREFIX, runSk, workspacePk } from '../core/keys.js';
import type { GapCandidate, Rates, RunDiff, RunSummary } from '../core/metrics.js';
import { documentClient, TABLE_NAME } from '../core/table.js';
import { queryAll } from './query.js';

export type RunStatus = 'running' | 'complete' | 'failed' | 'refused';

export interface EngineCost {
  answers: number;
  searchCalls: number;
  inputTokens: number;
  outputTokens: number;
  dollars: number;
}

export interface Run {
  runId: string;
  workspaceId: string;
  status: RunStatus;
  trigger: string;
  startedAt: string;
  finishedAt?: string;
  executionArn?: string;
  engines: EngineId[];
  skippedEngines: EngineId[];
  samples: number;
  promptCount: number;
  plannedCalls: number;
  answered: number;
  extracted: number;
  failed: number;
  refusedReason?: string;
  cost?: { engines: Partial<Record<EngineId, EngineCost>>; extraction: number; total: number };
  rates?: Rates;
  summary?: RunSummary;
  diff?: RunDiff;
  newBrands?: string[];
  gapCandidates?: GapCandidate[];
  gapJobsQueued?: number;
  disagreements?: number;
}

const key = (workspaceId: string, runId: string) => ({
  PK: workspacePk(workspaceId),
  SK: runSk(runId),
});

export async function createRun(run: Run): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...key(run.workspaceId, run.runId), ...run },
      ConditionExpression: 'attribute_not_exists(SK)',
    }),
  );
}

export async function getRun(workspaceId: string, runId: string): Promise<Run | undefined> {
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: key(workspaceId, runId) }),
  );
  if (!Item) {
    return undefined;
  }
  const { PK, SK, ...run } = Item;
  return run as Run;
}

export async function addRunCounters(
  workspaceId: string,
  runId: string,
  counters: Partial<Record<'answered' | 'extracted' | 'failed', number>>,
): Promise<void> {
  const entries = Object.entries(counters).filter(([, value]) => value);
  if (!entries.length) {
    return;
  }
  await documentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key(workspaceId, runId),
      UpdateExpression: `ADD ${entries.map(([name]) => `#${name} :${name}`).join(', ')}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([name]) => [`#${name}`, name])),
      ExpressionAttributeValues: Object.fromEntries(
        entries.map(([name, value]) => [`:${name}`, value]),
      ),
    }),
  );
}

export async function finishRun(
  workspaceId: string,
  runId: string,
  fields: Partial<Run> & { status: RunStatus },
): Promise<void> {
  const entries = Object.entries({ ...fields, finishedAt: new Date().toISOString() }).filter(
    ([, value]) => value !== undefined,
  );
  await documentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key(workspaceId, runId),
      UpdateExpression: `SET ${entries.map(([name]) => `#${name} = :${name}`).join(', ')}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([name]) => [`#${name}`, name])),
      ExpressionAttributeValues: Object.fromEntries(
        entries.map(([name, value]) => [`:${name}`, value]),
      ),
      ConditionExpression: 'attribute_exists(SK)',
    }),
  );
}

export async function listRuns(workspaceId: string, limit = 20): Promise<Run[]> {
  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': RUN_PREFIX },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return Items.map(({ PK, SK, ...run }) => run as unknown as Run);
}

export async function previousCompletedRun(
  workspaceId: string,
  runId: string,
): Promise<Run | undefined> {
  const runs = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :before',
    ExpressionAttributeValues: {
      ':pk': workspacePk(workspaceId),
      ':from': RUN_PREFIX,
      ':before': runSk(runId),
      ':complete': 'complete',
      ':runId': runId,
    },
    FilterExpression: '#status = :complete AND runId <> :runId',
    ExpressionAttributeNames: { '#status': 'status' },
    ProjectionExpression: 'runId, #status, summary',
    ScanIndexForward: false,
  });
  return runs[0] as unknown as Run | undefined;
}
