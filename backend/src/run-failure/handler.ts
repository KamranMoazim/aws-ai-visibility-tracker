import type { WorkItem } from '../core/work.js';
import { putFailed } from '../data/answers.js';
import { addRunCounters, finishRun } from '../data/runs.js';

export interface StepError {
  Error?: string;
  Cause?: string;
}

export type FailureEvent =
  | { kind: 'item'; item: WorkItem; error: StepError }
  | { kind: 'run'; runId: string; workspaceId: string; error: StepError };

export function describeError(error: StepError): string {
  try {
    const cause = JSON.parse(error.Cause ?? '{}') as { errorType?: string; errorMessage?: string };
    return `${cause.errorType ?? error.Error}: ${cause.errorMessage ?? error.Cause}`;
  } catch {
    return `${error.Error}: ${error.Cause}`;
  }
}

export async function handler(event: FailureEvent): Promise<void> {
  const message = describeError(event.error);
  if (event.kind === 'run') {
    await finishRun(event.workspaceId, event.runId, { status: 'failed', refusedReason: message });
    console.error(`run failed run=${event.runId} ${message}`);
    return;
  }
  const { item } = event;
  if (await putFailed(item, message)) {
    await addRunCounters(item.workspaceId, item.runId, { failed: 1 });
  }
  console.error(
    `ask failed run=${item.runId} slot=${item.promptId}/${item.engine}/${item.sample} ${message}`,
  );
}
