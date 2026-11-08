import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Hono } from 'hono';
import { z } from 'zod';
import { HttpError } from '../../core/http-error.js';
import {
  getPost,
  listLinks,
  listPosts,
  putPost,
  type Post,
  type PostStatus,
} from '../../data/posts.js';
import { listPromptTrend } from '../../data/metrics.js';
import { getPrompt } from '../../data/workspaces.js';
import { checkCrawlers } from '../../publish/crawlers.js';
import { findPlaceholders } from '../../publish/placeholders.js';
import { NoBrief, startDraftFromGap } from '../../publish/start-draft.js';
import type { PublishEvent, PublishResult } from '../../publish/handler.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const POST_STATUSES: PostStatus[] = ['generating', 'draft', 'published', 'failed'];
const lambda = new LambdaClient({});

const PostEdit = z.object({
  title: z.string().trim().min(5).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'use lowercase words joined by hyphens')
    .max(80),
  description: z.string().trim().min(10).max(300),
  markdown: z.string().trim().min(1).max(40_000),
  faq: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(300),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(10),
});

async function ownedPost(workspaceId: string, postId: string): Promise<Post> {
  const post = ID_PATTERN.test(postId) ? await getPost(workspaceId, postId) : undefined;
  if (!post) {
    throw new HttpError(404, 'not_found', 'Post not found');
  }
  return post;
}

async function invokePublish(event: PublishEvent): Promise<PublishResult> {
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.PUBLISH_FUNCTION_NAME!,
      Payload: Buffer.from(JSON.stringify(event)),
    }),
  );
  if (response.FunctionError) {
    throw new Error(`publish function failed: ${Buffer.from(response.Payload ?? []).toString()}`);
  }
  return JSON.parse(Buffer.from(response.Payload ?? []).toString()) as PublishResult;
}

function failFrom(result: PublishResult): never {
  const failure = result as Extract<PublishResult, { ok: false }>;
  const status = {
    not_found: 404,
    conflict: 409,
    slug_taken: 409,
    placeholders: 400,
    no_wordpress: 400,
  }[failure.code];
  throw new HttpError(status ?? 502, failure.code, failure.message);
}

export const postRoutes = new Hono<AppEnv>();

postRoutes.post('/:ws/gaps/:id/draft', async (context) => {
  const workspace = await ownedWorkspace(context);
  const gapId = context.req.param('id');
  if (!ID_PATTERN.test(gapId)) {
    throw new HttpError(404, 'not_found', 'Gap not found');
  }
  try {
    const post = await startDraftFromGap(workspace.workspaceId, gapId, process.env.GAP_QUEUE_URL!);
    return context.json({ postId: post.postId }, 202);
  } catch (error) {
    if (error instanceof NoBrief) {
      throw new HttpError(404, 'not_found', error.message);
    }
    throw error;
  }
});

postRoutes.get('/:ws/posts', async (context) => {
  const workspace = await ownedWorkspace(context);
  const status = (context.req.query('status') ?? 'draft') as PostStatus;
  if (!POST_STATUSES.includes(status)) {
    throw new HttpError(400, 'bad_request', `status must be one of ${POST_STATUSES.join(', ')}`);
  }
  const posts = await listPosts(workspace.workspaceId, status);
  return context.json({
    posts: posts.map(({ markdown, faq, ...post }) => ({
      ...post,
      placeholders: findPlaceholders({ ...post, markdown, faq }).length,
    })),
  });
});

postRoutes.get('/:ws/posts/:id', async (context) => {
  const workspace = await ownedWorkspace(context);
  const post = await ownedPost(workspace.workspaceId, context.req.param('id'));
  return context.json({ post, placeholders: findPlaceholders(post) });
});

postRoutes.put('/:ws/posts/:id', async (context) => {
  const workspace = await ownedWorkspace(context);
  const post = await ownedPost(workspace.workspaceId, context.req.param('id'));
  if (post.status !== 'draft' && post.status !== 'published') {
    throw new HttpError(409, 'conflict', `A ${post.status} post cannot be edited`);
  }
  const edit = PostEdit.parse(await context.req.json());
  const updated: Post = { ...post, ...edit, updatedAt: new Date().toISOString() };
  await putPost(updated);
  return context.json({ post: updated, placeholders: findPlaceholders(updated) });
});

postRoutes.post('/:ws/posts/:id/publish', async (context) => {
  const workspace = await ownedWorkspace(context);
  const post = await ownedPost(workspace.workspaceId, context.req.param('id'));
  const { target } = z
    .object({ target: z.enum(['hosted', 'wordpress']).default('hosted') })
    .parse(await context.req.json().catch(() => ({})));
  const placeholders = findPlaceholders(post);
  if (placeholders.length) {
    throw new HttpError(
      400,
      'placeholders',
      `Fill in ${placeholders.length} placeholder(s) before publishing`,
    );
  }
  const result = await invokePublish({
    action: 'publish',
    workspaceId: workspace.workspaceId,
    postId: post.postId,
    target,
  });
  if (!result.ok) {
    failFrom(result);
  }
  return context.json({ published: true, url: result.url });
});

postRoutes.post('/:ws/posts/:id/unpublish', async (context) => {
  const workspace = await ownedWorkspace(context);
  const post = await ownedPost(workspace.workspaceId, context.req.param('id'));
  const result = await invokePublish({
    action: 'unpublish',
    workspaceId: workspace.workspaceId,
    postId: post.postId,
  });
  if (!result.ok) {
    failFrom(result);
  }
  return context.json({ unpublished: true });
});

postRoutes.get('/:ws/crawler-check', async (context) => {
  const workspace = await ownedWorkspace(context);
  const target = context.req.query('target') ?? 'hosted';
  let url: string;
  let path = '/';
  if (target === 'hosted') {
    url = process.env.SITE_URL!;
    path = '/guides/';
  } else if (target === 'wordpress') {
    if (!workspace.wordpress) {
      throw new HttpError(400, 'no_wordpress', 'Add WordPress settings first');
    }
    url = workspace.wordpress.siteUrl;
  } else if (target === 'site') {
    url = `https://${workspace.brand.domain.replace(/^https?:\/\//, '')}`;
  } else {
    throw new HttpError(400, 'bad_request', 'target must be hosted, wordpress or site');
  }
  return context.json(await checkCrawlers(url, path));
});

postRoutes.get('/:ws/prompts/:id/trend', async (context) => {
  const workspace = await ownedWorkspace(context);
  const promptId = context.req.param('id');
  const prompt = ID_PATTERN.test(promptId)
    ? await getPrompt(workspace.workspaceId, promptId)
    : undefined;
  if (!prompt) {
    throw new HttpError(404, 'not_found', 'Prompt not found');
  }
  const [points, links] = await Promise.all([
    listPromptTrend(workspace.workspaceId, promptId),
    listLinks(workspace.workspaceId, promptId),
  ]);
  return context.json({ points, links });
});
