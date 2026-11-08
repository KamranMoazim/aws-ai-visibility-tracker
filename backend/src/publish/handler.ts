import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getJson, putJson, RAW_BUCKET_NAME, s3Client } from '../core/storage.js';
import { getPost, putLinks, putPost, type Post, type PublishTarget } from '../data/posts.js';
import { getWorkspace } from '../data/workspaces.js';
import { markdownToHtml, renderInline } from './markdown.js';
import { removeEntry, SlugTaken, upsertEntry, type ManifestEntry } from './manifest.js';
import { findPlaceholders } from './placeholders.js';
import {
  GUIDES_PATH,
  guideKey,
  guideUrl,
  renderGuide,
  renderIndex,
  renderLlmsTxt,
  renderRobots,
  renderSitemap,
} from './render.js';
import { publishToWordPress } from './wordpress.js';

export const MANIFEST_KEY = 'site/manifest.json';
const SITE_BUCKET = process.env.SITE_BUCKET_NAME!;
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const SITE_NAME = process.env.GUIDES_SITE_NAME || 'Guides';
const cloudfront = new CloudFrontClient({});

export type PublishEvent =
  | { action: 'publish'; workspaceId: string; postId: string; target: PublishTarget }
  | { action: 'unpublish'; workspaceId: string; postId: string };

export type PublishResult =
  | { ok: true; url?: string }
  | { ok: false; code: string; message: string };

async function readManifest(): Promise<ManifestEntry[]> {
  try {
    return await getJson<ManifestEntry[]>(RAW_BUCKET_NAME, MANIFEST_KEY);
  } catch (error) {
    if ((error as Error).name === 'NoSuchKey') {
      return [];
    }
    throw error;
  }
}

async function putSiteObject(key: string, body: string, contentType: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: SITE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=300',
    }),
  );
}

async function writeSiteFiles(entries: ManifestEntry[]): Promise<void> {
  await putSiteObject(
    `${GUIDES_PATH}/index.html`,
    renderIndex(SITE_NAME, SITE_URL, entries),
    'text/html; charset=utf-8',
  );
  await putSiteObject('sitemap.xml', renderSitemap(SITE_URL, entries), 'application/xml');
  await putSiteObject(
    'llms.txt',
    renderLlmsTxt(SITE_NAME, SITE_URL, entries),
    'text/plain; charset=utf-8',
  );
  await putSiteObject('robots.txt', renderRobots(SITE_URL), 'text/plain; charset=utf-8');
  await putJson(RAW_BUCKET_NAME, MANIFEST_KEY, entries);
}

async function invalidate(paths: string[]): Promise<void> {
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: process.env.DISTRIBUTION_ID!,
      InvalidationBatch: {
        CallerReference: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    }),
  );
}

export function articleHtml(post: Pick<Post, 'markdown' | 'faq'>): string {
  const faq = post.faq.length
    ? `<h2>Questions</h2>${post.faq.map((pair) => `<h3>${renderInline(pair.question)}</h3><p>${renderInline(pair.answer)}</p>`).join('')}`
    : '';
  return `${markdownToHtml(post.markdown).html}${faq}`;
}

async function publishHosted(post: Post, publisher: string): Promise<string> {
  const now = new Date().toISOString();
  const entries = await readManifest();
  const previous = entries.find((entry) => entry.postId === post.postId);
  const entry: ManifestEntry = {
    postId: post.postId,
    slug: post.slug,
    title: post.title,
    description: post.description,
    publishedAt: previous?.publishedAt ?? now,
    updatedAt: now,
  };
  const updated = upsertEntry(entries, entry);
  await putSiteObject(
    guideKey(post.slug),
    renderGuide({
      ...entry,
      markdown: post.markdown,
      faq: post.faq,
      siteName: publisher,
      baseUrl: SITE_URL,
    }),
    'text/html; charset=utf-8',
  );
  if (previous && previous.slug !== post.slug) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: SITE_BUCKET, Key: guideKey(previous.slug) }),
    );
  }
  await writeSiteFiles(updated);
  await invalidate([
    `/${GUIDES_PATH}/${post.slug}/*`,
    `/${GUIDES_PATH}/`,
    `/${GUIDES_PATH}/index.html`,
    '/sitemap.xml',
    '/llms.txt',
    '/robots.txt',
    ...(previous && previous.slug !== post.slug ? [`/${GUIDES_PATH}/${previous.slug}/*`] : []),
  ]);
  return guideUrl(SITE_URL, post.slug);
}

async function unpublishHosted(post: Post): Promise<void> {
  const entries = await readManifest();
  const previous = entries.find((entry) => entry.postId === post.postId);
  if (!previous) {
    return;
  }
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: SITE_BUCKET, Key: guideKey(previous.slug) }),
  );
  await writeSiteFiles(removeEntry(entries, post.postId));
  await invalidate([
    `/${GUIDES_PATH}/${previous.slug}/*`,
    `/${GUIDES_PATH}/`,
    `/${GUIDES_PATH}/index.html`,
    '/sitemap.xml',
    '/llms.txt',
  ]);
}

export async function handler(event: PublishEvent): Promise<PublishResult> {
  const [workspace, post] = await Promise.all([
    getWorkspace(event.workspaceId),
    getPost(event.workspaceId, event.postId),
  ]);
  if (!workspace || !post) {
    return { ok: false, code: 'not_found', message: 'Post not found' };
  }
  const now = new Date().toISOString();
  if (event.action === 'unpublish') {
    if (post.status !== 'published') {
      return { ok: false, code: 'conflict', message: 'Only published posts can be unpublished' };
    }
    if (post.target === 'hosted') {
      await unpublishHosted(post);
    }
    await putPost({ ...post, status: 'draft', publishedUrl: undefined, updatedAt: now });
    return { ok: true };
  }
  if (post.status !== 'draft' && post.status !== 'published') {
    return { ok: false, code: 'conflict', message: `A ${post.status} post cannot be published` };
  }
  const placeholders = findPlaceholders(post);
  if (placeholders.length) {
    return {
      ok: false,
      code: 'placeholders',
      message: `Fill in ${placeholders.length} placeholder${placeholders.length === 1 ? '' : 's'} before publishing`,
    };
  }
  let url: string;
  let wordpressId = post.wordpressId;
  try {
    if (event.target === 'wordpress') {
      if (!workspace.wordpress) {
        return { ok: false, code: 'no_wordpress', message: 'Add WordPress settings first' };
      }
      const result = await publishToWordPress(workspace.wordpress, {
        title: post.title,
        description: post.description,
        slug: post.slug,
        html: articleHtml(post),
        wordpressId: post.target === 'wordpress' ? post.wordpressId : undefined,
      });
      url = result.link;
      wordpressId = result.id;
    } else {
      url = await publishHosted(post, workspace.brand.name);
    }
  } catch (error) {
    if (error instanceof SlugTaken) {
      return { ok: false, code: 'slug_taken', message: error.message };
    }
    console.error(
      `publish failed post=${post.postId} ${(error as Error).name}: ${(error as Error).message}`,
    );
    return { ok: false, code: 'publish_failed', message: (error as Error).message.slice(0, 300) };
  }
  const publishedAt = post.publishedAt ?? now;
  await putPost({
    ...post,
    status: 'published',
    target: event.target,
    publishedAt,
    publishedUrl: url,
    wordpressId,
    error: undefined,
    updatedAt: now,
  });
  await putLinks(
    workspace.workspaceId,
    post.promptIds.map((promptId) => ({
      promptId,
      postId: post.postId,
      title: post.title,
      publishedAt,
      url,
    })),
  );
  console.log(`publish ok post=${post.postId} target=${event.target} url=${url}`);
  return { ok: true, url };
}
