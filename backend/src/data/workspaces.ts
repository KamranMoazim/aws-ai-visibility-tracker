import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  COMPETITOR_PREFIX,
  competitorSk,
  META_SK,
  PROMPT_PREFIX,
  promptSk,
  userPk,
  workspacePk,
  workspaceSk,
} from '../core/keys.js';
import { OWN_BRAND_ID, type TrackedBrand } from '../core/matcher.js';
import type { CompetitorRecord, PromptRecord, Workspace } from '../core/schemas.js';
import { documentClient, TABLE_NAME } from '../core/table.js';
import { queryAll } from './query.js';

const strip = <T extends object>(item: Record<string, unknown>): T => {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest as T;
};

export async function getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: workspacePk(workspaceId), SK: META_SK } }),
  );
  return Item ? strip<Workspace>(Item) : undefined;
}

export async function putWorkspace(workspace: Workspace): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: workspacePk(workspace.workspaceId),
        SK: META_SK,
        GSI1PK: userPk(workspace.ownerId),
        GSI1SK: workspaceSk(workspace.workspaceId),
        ...workspace,
      },
    }),
  );
}

export async function listCompetitors(workspaceId: string): Promise<CompetitorRecord[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': COMPETITOR_PREFIX },
  });
  return items.map((item) => strip<CompetitorRecord>(item));
}

export async function replaceCompetitors(
  workspaceId: string,
  competitors: CompetitorRecord[],
): Promise<void> {
  const existing = await listCompetitors(workspaceId);
  const keep = new Set(competitors.map((competitor) => competitor.slug));
  const deletes = existing
    .filter((competitor) => !keep.has(competitor.slug))
    .map((competitor) => ({
      Delete: {
        TableName: TABLE_NAME,
        Key: { PK: workspacePk(workspaceId), SK: competitorSk(competitor.slug) },
      },
    }));
  const puts = competitors.map((competitor) => ({
    Put: {
      TableName: TABLE_NAME,
      Item: { PK: workspacePk(workspaceId), SK: competitorSk(competitor.slug), ...competitor },
    },
  }));
  const operations = [...deletes, ...puts];
  if (operations.length) {
    await documentClient.send(new TransactWriteCommand({ TransactItems: operations }));
  }
}

export async function listPrompts(workspaceId: string): Promise<PromptRecord[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': PROMPT_PREFIX },
  });
  return items.map((item) => strip<PromptRecord>(item));
}

export async function putPrompt(workspaceId: string, prompt: PromptRecord): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: workspacePk(workspaceId), SK: promptSk(prompt.promptId), ...prompt },
    }),
  );
}

export function trackedBrandsOf(
  workspace: Workspace,
  competitors: CompetitorRecord[],
): TrackedBrand[] {
  return [
    { brandId: OWN_BRAND_ID, own: true, ...workspace.brand },
    ...competitors.map((competitor) => ({
      brandId: competitor.slug,
      name: competitor.name,
      domain: competitor.domain,
      aliases: competitor.aliases,
    })),
  ];
}
