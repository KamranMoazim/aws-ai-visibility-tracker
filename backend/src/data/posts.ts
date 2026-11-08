import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { linkPrefix, linkSk, postIndexPk, postSk, workspacePk } from '../core/keys.js';
import { documentClient, GSI1, TABLE_NAME } from '../core/table.js';
import type { FaqPair } from '../publish/render.js';
import { batchPut } from './metrics.js';
import { queryAll } from './query.js';

export type PostStatus = 'generating' | 'draft' | 'published' | 'failed';
export type PublishTarget = 'hosted' | 'wordpress';

export interface Post {
  postId: string;
  workspaceId: string;
  gapId?: string;
  promptIds: string[];
  status: PostStatus;
  title: string;
  slug: string;
  description: string;
  markdown: string;
  faq: FaqPair[];
  target?: PublishTarget;
  publishedAt?: string;
  publishedUrl?: string;
  wordpressId?: number;
  draftModel?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostLink {
  promptId: string;
  postId: string;
  title: string;
  publishedAt: string;
  url?: string;
}

const keyOf = (workspaceId: string, postId: string) => ({
  PK: workspacePk(workspaceId),
  SK: postSk(postId),
});

export async function putPost(post: Post): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keyOf(post.workspaceId, post.postId),
        GSI1PK: postIndexPk(post.workspaceId, post.status),
        GSI1SK: post.updatedAt,
        ...post,
      },
    }),
  );
}

export async function getPost(workspaceId: string, postId: string): Promise<Post | undefined> {
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keyOf(workspaceId, postId) }),
  );
  if (!Item) {
    return undefined;
  }
  const { PK, SK, GSI1PK, GSI1SK, ...post } = Item;
  return post as Post;
}

export async function listPosts(workspaceId: string, status: PostStatus): Promise<Post[]> {
  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': postIndexPk(workspaceId, status) },
      ScanIndexForward: false,
      Limit: 100,
    }),
  );
  return Items.map(({ PK, SK, GSI1PK, GSI1SK, ...post }) => post as Post);
}

export async function putLinks(workspaceId: string, links: PostLink[]): Promise<void> {
  await batchPut(
    links.map((link) => ({
      PK: workspacePk(workspaceId),
      SK: linkSk(link.promptId, link.postId),
      ...link,
    })),
  );
}

export async function listLinks(workspaceId: string, promptId: string): Promise<PostLink[]> {
  const items = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': workspacePk(workspaceId), ':prefix': linkPrefix(promptId) },
  });
  return items.map(({ PK, SK, ...link }) => link as unknown as PostLink);
}
