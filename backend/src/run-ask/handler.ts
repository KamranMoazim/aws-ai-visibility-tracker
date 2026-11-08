import { putJson, RAW_BUCKET_NAME, rawAnswerKey } from '../core/storage.js';
import type { WorkItem } from '../core/work.js';
import { getAnswer, putAnswered } from '../data/answers.js';
import { addRunCounters } from '../data/runs.js';
import { createEngine } from '../engines/index.js';
import { EngineError } from '../engines/types.js';

export async function handler(item: WorkItem): Promise<WorkItem> {
  const existing = await getAnswer(item);
  if (existing && existing.status !== 'failed') {
    console.log(`ask skip run=${item.runId} slot=${item.promptId}/${item.engine}/${item.sample}`);
    return item;
  }
  const engine = await createEngine(item.engine);
  if (!engine) {
    throw new EngineError(item.engine, undefined, false, 'engine not configured');
  }
  const askedAt = new Date().toISOString();
  const answer = await engine.ask(item.prompt, { country: item.country, sample: item.sample });
  const rawKey = rawAnswerKey(item.runId, item.promptId, item.engine, item.sample);
  await putJson(RAW_BUCKET_NAME, rawKey, { ...item, askedAt, answer });
  const written = await putAnswered(item, {
    askedAt,
    rawKey,
    model: answer.model,
    text: answer.text,
    citations: answer.citations,
    searchCalls: answer.searchCalls,
    usage: answer.usage,
  });
  if (written) {
    await addRunCounters(item.workspaceId, item.runId, {
      answered: 1,
      failed: existing?.status === 'failed' ? -1 : 0,
    });
  }
  console.log(
    `ask ok run=${item.runId} slot=${item.promptId}/${item.engine}/${item.sample} ` +
      `citations=${answer.citations.length} searchCalls=${answer.searchCalls} written=${written}`,
  );
  return item;
}
