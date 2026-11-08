import type { EngineId } from '../engines/types.js';

export interface WorkItem {
  runId: string;
  workspaceId: string;
  startedAt: string;
  promptId: string;
  prompt: string;
  engine: EngineId;
  sample: number;
  country?: string;
}

export interface WorkPlan {
  total: number;
  work: Record<EngineId, WorkItem[]>;
}

export interface PlanInput {
  runId: string;
  workspaceId: string;
  startedAt: string;
  country?: string;
  prompts: { promptId: string; text: string }[];
  engines: EngineId[];
  samples: number;
}

export function buildWorkPlan(input: PlanInput): WorkPlan {
  const work: Record<EngineId, WorkItem[]> = { openai: [], nova: [], sonar: [], fake: [] };
  for (const engine of input.engines) {
    for (const prompt of input.prompts) {
      for (let sample = 0; sample < input.samples; sample++) {
        work[engine].push({
          runId: input.runId,
          workspaceId: input.workspaceId,
          startedAt: input.startedAt,
          promptId: prompt.promptId,
          prompt: prompt.text,
          engine,
          sample,
          country: input.country,
        });
      }
    }
  }
  return { total: Object.values(work).reduce((sum, items) => sum + items.length, 0), work };
}
