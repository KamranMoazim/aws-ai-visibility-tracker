import { ALL_ENGINES, ALL_PROMPTS } from '../core/keys.js';
import {
  computeRollups,
  diffSummaries,
  findGapCandidates,
  ratesOf,
  rollupKey,
  summarize,
} from '../core/metrics.js';
import { emptyUsage, engineCost, extractionCost, type EngineUsage } from '../core/pricing.js';
import { listRunAnswers, type AnswerRecord } from '../data/answers.js';
import { recordUntrackedBrands, type UntrackedSighting } from '../data/brands.js';
import { writeRollups } from '../data/metrics.js';
import { finishRun, getRun, previousCompletedRun, type EngineCost } from '../data/runs.js';
import { getWorkspace } from '../data/workspaces.js';
import type { EngineId } from '../engines/types.js';
import { sendJobs } from '../core/queue.js';

export interface AggregateEvent {
  runId: string;
  workspaceId: string;
}

export function untrackedSightings(answers: AnswerRecord[]): UntrackedSighting[] {
  const sightings = new Map<string, UntrackedSighting>();
  for (const answer of answers) {
    for (const mention of answer.mentions ?? []) {
      if (mention.brandId) {
        continue;
      }
      const slug = mention.key.replace(/^x:/, '');
      const sighting = sightings.get(slug) ?? { slug, name: mention.name, count: 0, promptIds: [] };
      sighting.count++;
      if (!sighting.promptIds.includes(answer.promptId)) {
        sighting.promptIds.push(answer.promptId);
      }
      sightings.set(slug, sighting);
    }
  }
  return [...sightings.values()];
}

export function costOf(answers: AnswerRecord[]) {
  const usageByEngine = new Map<EngineId, EngineUsage>();
  let extractInput = 0;
  let extractOutput = 0;
  for (const answer of answers) {
    if (answer.status === 'failed') {
      continue;
    }
    const engine = answer.engine as EngineId;
    const usage = usageByEngine.get(engine) ?? emptyUsage();
    usage.answers++;
    usage.searchCalls += answer.searchCalls ?? 0;
    usage.inputTokens += answer.usage?.inputTokens ?? 0;
    usage.outputTokens += answer.usage?.outputTokens ?? 0;
    usageByEngine.set(engine, usage);
    extractInput += answer.extractUsage?.inputTokens ?? 0;
    extractOutput += answer.extractUsage?.outputTokens ?? 0;
  }
  const engines: Partial<Record<EngineId, EngineCost>> = {};
  for (const [engine, usage] of usageByEngine) {
    engines[engine] = { ...usage, dollars: engineCost(engine, usage) };
  }
  const extraction = extractionCost(extractInput, extractOutput);
  const total =
    Object.values(engines).reduce((sum, cost) => sum + (cost?.dollars ?? 0), 0) + extraction;
  return { engines, extraction, total: Math.round(total * 10000) / 10000 };
}

export async function handler(event: AggregateEvent) {
  const [run, workspace, answers] = await Promise.all([
    getRun(event.workspaceId, event.runId),
    getWorkspace(event.workspaceId),
    listRunAnswers(event.runId),
  ]);
  if (!run || !workspace) {
    throw new Error(`run ${event.runId} or its workspace not found`);
  }
  const rollups = computeRollups(answers, workspace.brand.domain);
  await writeRollups(workspace.workspaceId, run.runId, run.startedAt, rollups);
  const summary = summarize(rollups);
  const previous = await previousCompletedRun(workspace.workspaceId, run.runId);
  const newBrands = await recordUntrackedBrands(
    workspace.workspaceId,
    run.runId,
    run.startedAt,
    untrackedSightings(answers),
  );
  const gapCandidates = findGapCandidates(rollups);
  let gapJobsQueued = 0;
  if (process.env.GAP_QUEUE_URL && gapCandidates.length) {
    try {
      await sendJobs(
        process.env.GAP_QUEUE_URL,
        gapCandidates.map((gap) => ({
          type: 'gap' as const,
          workspaceId: workspace.workspaceId,
          promptId: gap.promptId,
          runId: run.runId,
        })),
      );
      gapJobsQueued = gapCandidates.length;
    } catch (error) {
      console.error(`gap jobs not queued run=${run.runId} ${(error as Error).message}`);
    }
  }
  const total = rollups.get(rollupKey(ALL_PROMPTS, ALL_ENGINES));
  const extracted = answers.filter((answer) => answer.status === 'extracted').length;
  const failed = answers.filter((answer) => answer.status === 'failed').length;
  await finishRun(workspace.workspaceId, run.runId, {
    status: extracted > 0 ? 'complete' : 'failed',
    answered: answers.length - failed,
    extracted,
    failed,
    cost: costOf(answers),
    rates: total ? ratesOf(total) : undefined,
    summary,
    diff: diffSummaries(previous?.summary, summary),
    newBrands,
    gapCandidates,
    gapJobsQueued,
    disagreements: answers.filter((answer) => answer.disagreement).length,
  });
  console.log(
    `run done run=${run.runId} answers=${answers.length} extracted=${extracted} failed=${failed} ` +
      `gaps=${gapCandidates.length} queued=${gapJobsQueued} newBrands=${newBrands.length}`,
  );
  return {
    runId: run.runId,
    workspaceId: workspace.workspaceId,
    extracted,
    failed,
    gapCandidates: gapCandidates.length,
  };
}
