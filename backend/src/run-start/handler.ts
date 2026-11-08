import { newRunId } from '../core/ids.js';
import { buildWorkPlan, type WorkItem } from '../core/work.js';
import { createRun, type Run } from '../data/runs.js';
import { getWorkspace, listPrompts } from '../data/workspaces.js';
import { createEngine } from '../engines/index.js';
import type { EngineId } from '../engines/types.js';

export const DEFAULT_MAX_CALLS = 300;
const MAX_STATE_BYTES = 200_000;

export interface StartRunInput {
  workspaceId: string;
  trigger?: string;
  maxCalls?: number;
}

export interface StartRunEvent {
  input: StartRunInput;
  executionArn?: string;
}

export interface StartRunResult {
  runId: string;
  workspaceId: string;
  refused: boolean;
  reason?: string;
  work: Record<EngineId, WorkItem[]>;
}

const configuredCap = () => Number(process.env.MAX_CALLS_PER_RUN) || DEFAULT_MAX_CALLS;

export async function handler({ input, executionArn }: StartRunEvent): Promise<StartRunResult> {
  const workspace = await getWorkspace(input.workspaceId);
  if (!workspace) {
    throw new Error(`workspace ${input.workspaceId} not found`);
  }
  const cap = Math.min(configuredCap(), input.maxCalls ?? Number.MAX_SAFE_INTEGER);
  const prompts = (await listPrompts(workspace.workspaceId)).filter((prompt) => prompt.active);
  const engines: EngineId[] = [];
  const skippedEngines: EngineId[] = [];
  for (const engine of workspace.engines) {
    if (await createEngine(engine)) {
      engines.push(engine);
    } else {
      skippedEngines.push(engine);
    }
  }

  const startedAt = new Date();
  const runId = newRunId(startedAt);
  const plan = buildWorkPlan({
    runId,
    workspaceId: workspace.workspaceId,
    startedAt: startedAt.toISOString(),
    country: workspace.country,
    prompts: prompts.map((prompt) => ({ promptId: prompt.promptId, text: prompt.text })),
    engines,
    samples: workspace.samples,
  });

  let reason: string | undefined;
  if (!prompts.length) {
    reason = 'no active prompts';
  } else if (!engines.length) {
    reason = 'no engines available (missing API keys?)';
  } else if (plan.total > cap) {
    reason = `${plan.total} calls exceeds the cap of ${cap}`;
  } else if (Buffer.byteLength(JSON.stringify(plan.work)) > MAX_STATE_BYTES) {
    reason = 'work list too large for one execution';
  }

  const run: Run = {
    runId,
    workspaceId: workspace.workspaceId,
    status: reason ? 'refused' : 'running',
    trigger: input.trigger ?? 'manual',
    startedAt: startedAt.toISOString(),
    executionArn,
    engines,
    skippedEngines,
    samples: workspace.samples,
    promptCount: prompts.length,
    plannedCalls: plan.total,
    answered: 0,
    extracted: 0,
    failed: 0,
    refusedReason: reason,
  };
  await createRun(run);
  console.log(
    `run start workspace=${workspace.workspaceId} run=${runId} calls=${plan.total} ` +
      `engines=${engines.join(',')} skipped=${skippedEngines.join(',') || '-'} refused=${reason ?? '-'}`,
  );
  return {
    runId,
    workspaceId: workspace.workspaceId,
    refused: Boolean(reason),
    reason,
    work: reason ? { openai: [], nova: [], sonar: [], fake: [] } : plan.work,
  };
}
