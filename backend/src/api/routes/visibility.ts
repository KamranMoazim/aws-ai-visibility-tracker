import { Hono } from 'hono';
import { HttpError } from '../../core/http-error.js';
import { ALL_ENGINES } from '../../core/keys.js';
import { listWorkspaceTrend } from '../../data/metrics.js';
import { listRuns } from '../../data/runs.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

const DEFAULT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoParam(value: string | undefined, fallback: Date): string {
  if (value === undefined) {
    return fallback.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'bad_request', `"${value}" is not a date`);
  }
  return parsed.toISOString();
}

export const visibilityRoutes = new Hono<AppEnv>();

visibilityRoutes.get('/:ws/visibility', async (context) => {
  const workspace = await ownedWorkspace(context);
  const now = new Date();
  const from = isoParam(context.req.query('from'), new Date(now.getTime() - DEFAULT_DAYS * DAY_MS));
  const to = isoParam(context.req.query('to'), now);
  const engine = context.req.query('engine') ?? ALL_ENGINES;
  const points = (await listWorkspaceTrend(workspace.workspaceId, from, to))
    .filter((point) => engine === '*' || point.engine === engine)
    .sort(
      (left, right) => left.at.localeCompare(right.at) || left.engine.localeCompare(right.engine),
    );
  const runs = await listRuns(workspace.workspaceId, 10);
  const latest = runs.find((run) => run.status === 'complete');
  return context.json({
    from,
    to,
    points,
    latestRun: latest
      ? {
          runId: latest.runId,
          startedAt: latest.startedAt,
          rates: latest.rates,
          summary: latest.summary,
          diff: latest.diff,
          newBrands: latest.newBrands,
          gapCandidates: latest.gapCandidates,
          disagreements: latest.disagreements,
          cost: latest.cost,
        }
      : null,
  });
});
