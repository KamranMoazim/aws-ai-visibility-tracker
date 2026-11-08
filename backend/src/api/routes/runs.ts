import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Hono } from 'hono';
import { HttpError } from '../../core/http-error.js';
import { getRun, listRuns } from '../../data/runs.js';
import { claimManualRun, listPrompts, releaseManualRun } from '../../data/workspaces.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

export const MANUAL_RUN_WINDOW_MS = 60 * 60 * 1000;
const sfn = new SFNClient({});

export const runRoutes = new Hono<AppEnv>();

runRoutes.post('/:ws/runs', async (context) => {
  const workspace = await ownedWorkspace(context);
  if (!(await listPrompts(workspace.workspaceId)).some((prompt) => prompt.active)) {
    throw new HttpError(400, 'no_prompts', 'Add at least one active prompt first');
  }
  if (!(await claimManualRun(workspace.workspaceId, new Date(), MANUAL_RUN_WINDOW_MS))) {
    throw new HttpError(429, 'rate_limited', 'Manual runs are limited to one per hour');
  }
  try {
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.STATE_MACHINE_ARN!,
        input: JSON.stringify({ workspaceId: workspace.workspaceId, trigger: 'manual' }),
      }),
    );
    return context.json({ started: true, executionArn }, 202);
  } catch (error) {
    await releaseManualRun(workspace.workspaceId);
    throw error;
  }
});

runRoutes.get('/:ws/runs', async (context) => {
  const workspace = await ownedWorkspace(context);
  const runs = await listRuns(workspace.workspaceId, 20);
  return context.json({
    runs: runs.map(({ summary, executionArn, ...run }) => run),
  });
});

runRoutes.get('/:ws/runs/:runId', async (context) => {
  const workspace = await ownedWorkspace(context);
  const runId = context.req.param('runId');
  const run = /^[A-Za-z0-9-]{1,64}$/.test(runId)
    ? await getRun(workspace.workspaceId, runId)
    : undefined;
  if (!run) {
    throw new HttpError(404, 'not_found', 'Run not found');
  }
  const { executionArn, ...visible } = run;
  return context.json({ run: visible });
});
