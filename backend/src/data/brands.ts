import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { brandSk, workspacePk } from '../core/keys.js';
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
