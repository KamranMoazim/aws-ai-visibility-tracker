import type { TrackedBrand } from '../core/matcher.js';
import type { WorkItem } from '../core/work.js';
import { getAnswer, markExtracted } from '../data/answers.js';
import { addRunCounters } from '../data/runs.js';
import { getWorkspace, listCompetitors, trackedBrandsOf } from '../data/workspaces.js';
import { mergeExtraction } from '../extraction/merge.js';
import { extractWithNova, type LlmExtraction } from '../extraction/nova-extractor.js';

const BRAND_CACHE_MS = 60_000;
const brandCache = new Map<string, { at: number; brands: TrackedBrand[] }>();

async function trackedBrands(workspaceId: string): Promise<TrackedBrand[]> {
  const cached = brandCache.get(workspaceId);
  if (cached && Date.now() - cached.at < BRAND_CACHE_MS) {
    return cached.brands;
  }
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error(`workspace ${workspaceId} not found`);
  }
  const brands = trackedBrandsOf(workspace, await listCompetitors(workspaceId));
  brandCache.set(workspaceId, { at: Date.now(), brands });
  return brands;
}

export async function handler(item: WorkItem): Promise<{ extracted: boolean }> {
  const answer = await getAnswer(item);
  if (answer?.status !== 'answered') {
    return { extracted: false };
  }
  const brands = await trackedBrands(item.workspaceId);
  const text = answer.text ?? '';
  let llm: LlmExtraction | undefined;
  let extractError: string | undefined;
  if (item.engine !== 'fake' && process.env.EXTRACTOR !== 'matcher' && text) {
    try {
      llm = await extractWithNova(text);
    } catch (error) {
      extractError = `${(error as Error).name}: ${(error as Error).message}`.slice(0, 500);
      console.error(
        `extract llm failed run=${item.runId} slot=${item.promptId}/${item.engine}/${item.sample} ${extractError}`,
      );
    }
  }
  const merged = mergeExtraction(text, brands, llm?.brands);
  const written = await markExtracted(item, {
    mentions: merged.mentions,
    disagreement: merged.disagreement,
    extractModel: llm?.model,
    extractUsage: llm?.usage,
    extractError,
  });
  if (written) {
    await addRunCounters(item.workspaceId, item.runId, { extracted: 1 });
  }
  return { extracted: written };
}
