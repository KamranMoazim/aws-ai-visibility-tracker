import { Hono } from 'hono';
import { z } from 'zod';
import { HttpError } from '../../core/http-error.js';
import { newId, slugify } from '../../core/ids.js';
import { mapNameToBrand, OWN_BRAND_ID } from '../../core/matcher.js';
import { deleteSchedule, upsertWeeklySchedule } from '../../core/schedules.js';
import {
  Competitor,
  MAX_COMPETITORS,
  WorkspaceSettings,
  type CompetitorRecord,
  type Workspace,
} from '../../core/schemas.js';
import { listUntrackedBrands } from '../../data/brands.js';
import {
  listCompetitors,
  listPrompts,
  listWorkspacesForUser,
  putWorkspace,
  replaceCompetitors,
} from '../../data/workspaces.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

export const MAX_WORKSPACES_PER_USER = 5;

const CompetitorList = z.array(Competitor).max(MAX_COMPETITORS);
const CreateWorkspace = WorkspaceSettings.extend({ competitors: CompetitorList.default([]) });

export function toCompetitorRecords(
  competitors: Competitor[],
  workspace: Pick<Workspace, 'brand'>,
): CompetitorRecord[] {
  const records: CompetitorRecord[] = [];
  for (const competitor of competitors) {
    const slug = slugify(competitor.name);
    if (!slug || slug === OWN_BRAND_ID) {
      throw new HttpError(400, 'bad_request', `"${competitor.name}" is not a usable name`);
    }
    if (records.some((record) => record.slug === slug)) {
      throw new HttpError(400, 'bad_request', `"${competitor.name}" is listed twice`);
    }
    if (mapNameToBrand(competitor.name, [{ brandId: OWN_BRAND_ID, ...workspace.brand }])) {
      throw new HttpError(400, 'bad_request', `"${competitor.name}" is your own brand`);
    }
    records.push({ ...competitor, slug });
  }
  return records;
}

async function syncSchedule(workspace: Workspace): Promise<void> {
  if (workspace.schedule === 'weekly') {
    await upsertWeeklySchedule(workspace.workspaceId);
  } else {
    await deleteSchedule(workspace.workspaceId);
  }
}

export const workspaceRoutes = new Hono<AppEnv>();

workspaceRoutes.get('/', async (context) => {
  const workspaces = await listWorkspacesForUser(context.get('userId'));
  return context.json({
    workspaces: workspaces
      .map((workspace) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        brand: workspace.brand,
        createdAt: workspace.createdAt,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  });
});

workspaceRoutes.post('/', async (context) => {
  const input = CreateWorkspace.parse(await context.req.json());
  const userId = context.get('userId');
  if ((await listWorkspacesForUser(userId)).length >= MAX_WORKSPACES_PER_USER) {
    throw new HttpError(409, 'limit', `At most ${MAX_WORKSPACES_PER_USER} workspaces per user`);
  }
  const { competitors, ...settings } = input;
  const workspace: Workspace = {
    ...settings,
    workspaceId: newId(),
    ownerId: userId,
    createdAt: new Date().toISOString(),
  };
  const records = toCompetitorRecords(competitors, workspace);
  await putWorkspace(workspace);
  await replaceCompetitors(workspace.workspaceId, records);
  await syncSchedule(workspace);
  return context.json({ workspace, competitors: records }, 201);
});

workspaceRoutes.get('/:ws', async (context) => {
  const workspace = await ownedWorkspace(context);
  const [competitors, prompts] = await Promise.all([
    listCompetitors(workspace.workspaceId),
    listPrompts(workspace.workspaceId),
  ]);
  return context.json({
    workspace,
    competitors,
    prompts: prompts.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  });
});

workspaceRoutes.put('/:ws', async (context) => {
  const existing = await ownedWorkspace(context);
  const settings = WorkspaceSettings.parse(await context.req.json());
  const workspace: Workspace = {
    ...existing,
    ...settings,
    workspaceId: existing.workspaceId,
    ownerId: existing.ownerId,
    createdAt: existing.createdAt,
  };
  toCompetitorRecords(await listCompetitors(workspace.workspaceId), workspace);
  await putWorkspace(workspace);
  await syncSchedule(workspace);
  return context.json({ workspace });
});

workspaceRoutes.put('/:ws/competitors', async (context) => {
  const workspace = await ownedWorkspace(context);
  const { competitors } = z.object({ competitors: CompetitorList }).parse(await context.req.json());
  const records = toCompetitorRecords(competitors, workspace);
  await replaceCompetitors(workspace.workspaceId, records);
  return context.json({ competitors: records });
});

workspaceRoutes.get('/:ws/brands', async (context) => {
  const workspace = await ownedWorkspace(context);
  const tracked = new Set(
    (await listCompetitors(workspace.workspaceId)).map((competitor) => competitor.slug),
  );
  const brands = (await listUntrackedBrands(workspace.workspaceId)).filter(
    (brand) => !tracked.has(brand.slug),
  );
  return context.json({ brands });
});
