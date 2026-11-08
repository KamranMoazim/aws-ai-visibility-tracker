import { Hono } from 'hono';
import { HttpError } from '../../core/http-error.js';
import { sendJobs } from '../../core/queue.js';
import { getGap, listGaps, setGapStatus, type GapStatus } from '../../data/gaps.js';
import { listPages, setSitemapImport } from '../../data/pages.js';
import { getPrompt } from '../../data/workspaces.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

const COOLDOWN_MS = 10 * 60 * 1000;
const STATUSES: GapStatus[] = ['open', 'dismissed', 'drafted', 'failed'];
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const queueUrl = () => process.env.GAP_QUEUE_URL!;

export const gapRoutes = new Hono<AppEnv>();

gapRoutes.get('/:ws/gaps', async (context) => {
  const workspace = await ownedWorkspace(context);
  const status = (context.req.query('status') ?? 'open') as GapStatus;
  if (!STATUSES.includes(status)) {
    throw new HttpError(400, 'bad_request', `status must be one of ${STATUSES.join(', ')}`);
  }
  const gaps = await listGaps(workspace.workspaceId, status);
  return context.json({
    gaps: gaps.map(({ brief, evidence, sourcesRead, briefUsage, ...gap }) => ({
      ...gap,
      title: brief?.title,
      pageType: brief?.pageType,
      action: brief?.action,
    })),
  });
});

gapRoutes.get('/:ws/gaps/:id', async (context) => {
  const workspace = await ownedWorkspace(context);
  const gapId = context.req.param('id');
  const gap = ID_PATTERN.test(gapId) ? await getGap(workspace.workspaceId, gapId) : undefined;
  if (!gap) {
    throw new HttpError(404, 'not_found', 'Gap not found');
  }
  return context.json({ gap });
});

for (const [action, from, to] of [
  ['dismiss', ['open', 'failed'], 'dismissed'],
  ['reopen', ['dismissed'], 'open'],
] as const) {
  gapRoutes.post(`/:ws/gaps/:id/${action}`, async (context) => {
    const workspace = await ownedWorkspace(context);
    const gapId = context.req.param('id');
    if (
      !ID_PATTERN.test(gapId) ||
      !(await setGapStatus(workspace.workspaceId, gapId, [...from], to))
    ) {
      throw new HttpError(
        409,
        'conflict',
        `Only ${from.join(' or ')} gaps can be changed to ${to}`,
      );
    }
    return context.json({ status: to });
  });
}

gapRoutes.post('/:ws/prompts/:id/gap', async (context) => {
  const workspace = await ownedWorkspace(context);
  const promptId = context.req.param('id');
  const prompt = ID_PATTERN.test(promptId)
    ? await getPrompt(workspace.workspaceId, promptId)
    : undefined;
  if (!prompt) {
    throw new HttpError(404, 'not_found', 'Prompt not found');
  }
  const existing = await getGap(workspace.workspaceId, promptId);
  if (existing && Date.now() - new Date(existing.updatedAt).getTime() < COOLDOWN_MS) {
    throw new HttpError(429, 'rate_limited', 'This gap was refreshed in the last 10 minutes');
  }
  await sendJobs(queueUrl(), [{ type: 'gap', workspaceId: workspace.workspaceId, promptId }]);
  return context.json({ queued: true }, 202);
});

gapRoutes.post('/:ws/sitemap/import', async (context) => {
  const workspace = await ownedWorkspace(context);
  const current = workspace.sitemapImport;
  if (
    current &&
    ['queued', 'running'].includes(current.status) &&
    Date.now() - new Date(current.at).getTime() < COOLDOWN_MS
  ) {
    throw new HttpError(409, 'in_progress', 'An import is already running');
  }
  await setSitemapImport(workspace.workspaceId, { status: 'queued', at: new Date().toISOString() });
  await sendJobs(queueUrl(), [{ type: 'sitemap', workspaceId: workspace.workspaceId }]);
  return context.json({ queued: true }, 202);
});

gapRoutes.get('/:ws/pages', async (context) => {
  const workspace = await ownedWorkspace(context);
  const pages = await listPages(workspace.workspaceId);
  return context.json({
    import: workspace.sitemapImport ?? null,
    count: pages.length,
    pages: pages
      .sort((left, right) => left.url.localeCompare(right.url))
      .slice(0, 100)
      .map(({ url, title }) => ({ url, title })),
  });
});
