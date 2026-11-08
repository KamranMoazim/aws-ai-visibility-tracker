import { computeRollups, findGapCandidates } from '../core/metrics.js';
import { bareDomain } from '../core/prompts.js';
import type { PromptRecord, Workspace } from '../core/schemas.js';
import { listPromptAnswers } from '../data/answers.js';
import { getGap, putGap, type Gap } from '../data/gaps.js';
import { listPages } from '../data/pages.js';
import { writeBrief, type PageText } from './brief.js';
import { buildEvidence, TOP_SOURCES } from './evidence.js';
import { pickClosestPages, readPage } from './pages.js';
import { gapScore } from './score.js';

const KEEP_STATUSES = new Set(['dismissed', 'drafted']);

async function readAll(bucket: string, urls: string[]) {
  const pages: PageText[] = [];
  const results: { url: string; title?: string; ok: boolean; error?: string }[] = [];
  for (const url of urls) {
    try {
      const page = await readPage(bucket, url);
      pages.push(page);
      results.push({ url, title: page.title, ok: true });
    } catch (error) {
      results.push({ url, ok: false, error: (error as Error).message.slice(0, 200) });
    }
  }
  return { pages, results };
}

export async function findGap(
  workspace: Workspace,
  prompt: PromptRecord,
  runId: string | undefined,
  bucket: string,
): Promise<Gap> {
  const answers = await listPromptAnswers(workspace.workspaceId, prompt.promptId, runId);
  const rollups = computeRollups(answers, workspace.brand.domain);
  const candidate = findGapCandidates(rollups).find((gap) => gap.promptId === prompt.promptId);
  const existing = await getGap(workspace.workspaceId, prompt.promptId);
  const now = new Date().toISOString();
  const base: Gap = {
    gapId: prompt.promptId,
    workspaceId: workspace.workspaceId,
    promptId: prompt.promptId,
    promptText: prompt.text,
    stage: prompt.stage,
    runId: answers[0]?.runId ?? runId,
    status: 'open',
    score: gapScore(
      candidate?.missingRate ?? 0,
      candidate?.missingEngines.length ?? 0,
      prompt.stage,
    ),
    missingEngines: candidate?.missingEngines ?? [],
    missingRate: candidate?.missingRate ?? 0,
    neverCited: candidate?.neverCited ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existing && KEEP_STATUSES.has(existing.status)) {
    base.status = existing.status;
  }

  const evidence = buildEvidence(answers, workspace.brand.domain);
  const sourceUrls = evidence.sources.slice(0, TOP_SOURCES).map((source) => source.url);
  const sources = await readAll(bucket, sourceUrls);
  const pages = await listPages(workspace.workspaceId);
  const ownUrls = pages.length ? await pickClosestPages(prompt.text, pages) : [];
  const ownPages = await readAll(bucket, ownUrls);

  const { excerpts, ...storedEvidence } = evidence;
  const gap: Gap = {
    ...base,
    evidence: { ...storedEvidence, sources: storedEvidence.sources.slice(0, 10) },
    sourcesRead: sources.results,
    ownPages: ownPages.pages.map((page) => ({ url: page.url, title: page.title })),
  };
  if (!evidence.answers) {
    await putGap({ ...gap, status: 'failed', error: 'no readable answers for this prompt yet' });
    return { ...gap, status: 'failed' };
  }
  const { brief, model, usage } = await writeBrief(
    prompt,
    workspace.brand.name,
    evidence,
    sources.pages,
    ownPages.pages,
  );
  const finished: Gap = { ...gap, brief, briefModel: model, briefUsage: usage };
  await putGap(finished);
  console.log(
    `gap ok workspace=${workspace.workspaceId} prompt=${prompt.promptId} score=${finished.score} ` +
      `sources=${sources.pages.length}/${sourceUrls.length} own=${ownPages.pages.length} ` +
      `domain=${bareDomain(workspace.brand.domain)}`,
  );
  return finished;
}
