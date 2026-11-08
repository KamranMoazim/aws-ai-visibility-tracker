import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BRAND_PREFIX, brandSk, workspacePk } from '../core/keys.js';
import { queryAll } from './query.js';
import { documentClient, TABLE_NAME } from '../core/table.js';

export interface UntrackedSighting {
  slug: string;
  name: string;
  count: number;
  promptIds: string[];
}

export async function recordUntrackedBrands(
  workspaceId: string,
  runId: string,
  seenAt: string,
  sightings: UntrackedSighting[],
): Promise<string[]> {
  const newSlugs: string[] = [];
  for (const sighting of sightings) {
    const response = await documentClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: workspacePk(workspaceId), SK: brandSk(sighting.slug) },
        UpdateExpression:
          'SET #name = :name, slug = :slug, lastSeen = :seenAt, lastRunId = :runId, ' +
          'firstSeen = if_not_exists(firstSeen, :seenAt) ADD mentions :count, promptIds :promptIds',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: {
          ':name': sighting.name,
          ':slug': sighting.slug,
          ':seenAt': seenAt,
          ':runId': runId,
          ':count': sighting.count,
          ':promptIds': new Set(sighting.promptIds),
        },
        ReturnValues: 'UPDATED_OLD',
      }),
    );
    if (!response.Attributes?.firstSeen) {
      newSlugs.push(sighting.slug);
    }
  }
  return newSlugs;
}

export interface UntrackedBrand {
  slug: string;
  name: string;
  mentions: number;
  promptIds: string[];
  firstSeen: string;
  lastSeen: string;
}

export async function listUntrackedBrands(workspaceId: string): Promise<UntrackedBrand[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': BRAND_PREFIX },
  });
  return items
    .map((item) => ({
      slug: item.slug as string,
      name: item.name as string,
      mentions: item.mentions as number,
      promptIds: [...((item.promptIds as Set<string> | undefined) ?? [])],
      firstSeen: item.firstSeen as string,
      lastSeen: item.lastSeen as string,
    }))
    .sort((left, right) => right.mentions - left.mentions);
}
