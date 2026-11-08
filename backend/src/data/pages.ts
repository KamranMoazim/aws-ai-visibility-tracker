import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashId } from '../core/ids.js';
import { META_SK, PAGE_PREFIX, pageSk, workspacePk } from '../core/keys.js';
import { documentClient, TABLE_NAME } from '../core/table.js';
import { batchPut } from './metrics.js';
import { queryAll } from './query.js';

export interface OwnPage {
  url: string;
  urlHash: string;
  title?: string;
  description?: string;
  importedAt: string;
}

export interface SitemapImport {
  status: 'queued' | 'running' | 'done' | 'failed';
  pages?: number;
  at: string;
  error?: string;
}

export async function putPages(
  workspaceId: string,
  pages: Omit<OwnPage, 'urlHash'>[],
): Promise<void> {
  await batchPut(
    pages.map((page) => {
      const urlHash = hashId(page.url);
      return { PK: workspacePk(workspaceId), SK: pageSk(urlHash), urlHash, ...page };
    }),
  );
}

export async function listPages(workspaceId: string): Promise<OwnPage[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': PAGE_PREFIX },
  });
  return items.map(({ PK, SK, ...page }) => page as unknown as OwnPage);
}

export async function setSitemapImport(workspaceId: string, state: SitemapImport): Promise<void> {
  await documentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: workspacePk(workspaceId), SK: META_SK },
      UpdateExpression: 'SET sitemapImport = :state',
      ConditionExpression: 'attribute_exists(SK)',
      ExpressionAttributeValues: { ':state': state },
    }),
  );
}
