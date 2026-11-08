import type { Context } from 'hono';
import { HttpError } from '../core/http-error.js';
import type { Workspace } from '../core/schemas.js';
import { getWorkspace } from '../data/workspaces.js';
import type { AppEnv } from './auth.js';

export async function ownedWorkspace(context: Context<AppEnv>): Promise<Workspace> {
  const workspaceId = context.req.param('ws') ?? '';
  const workspace = /^[A-Za-z0-9-]{1,64}$/.test(workspaceId)
    ? await getWorkspace(workspaceId)
    : undefined;
  if (!workspace || workspace.ownerId !== context.get('userId')) {
    throw new HttpError(404, 'not_found', 'Workspace not found');
  }
  return workspace;
}
