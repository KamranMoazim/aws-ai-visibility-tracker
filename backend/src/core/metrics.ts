import type { Mention } from '../extraction/merge.js';
import { ALL_ENGINES, ALL_PROMPTS } from './keys.js';
import { citesDomain, hostOf, OWN_BRAND_ID } from './matcher.js';

export interface AnswerForMetrics {
  promptId: string;
  engine: string;
  status: 'answered' | 'extracted' | 'failed';
  mentions?: Mention[];
  citations?: { url: string }[];
}

export interface Counts {
  answers: number;
  failed: number;
  mentioned: number;
  firstMentions: number;
  positionSum: number;
  recommended: number;
  cited: number;
  trackedMentions: number;
  brandMentions: Record<string, number>;
  citedDomains: Record<string, number>;
}

export interface Rates {
  mentionRate: number | null;
  firstMentionRate: number | null;
  averagePosition: number | null;
  shareOfVoice: number | null;
  recommendedRate: number | null;
  citationRate: number | null;
}

export type RunSummary = Record<string, Record<string, [mentioned: number, answers: number]>>;

export interface GapCandidate {
  promptId: string;
  missingEngines: string[];
  missingRate: number;
  neverCited: boolean;
}

export const MISSING_THRESHOLD = 2 / 3;

const emptyCounts = (): Counts => ({
  answers: 0,
  failed: 0,
  mentioned: 0,
  firstMentions: 0,
  positionSum: 0,
  recommended: 0,
  cited: 0,
  trackedMentions: 0,
  brandMentions: {},
  citedDomains: {},
});

export const rollupKey = (promptId: string, engine: string) => `${promptId}|${engine}`;

export function computeRollups(
  answers: AnswerForMetrics[],
  ownDomain: string | undefined,
): Map<string, Counts> {
  const rollups = new Map<string, Counts>();
  const countsFor = (promptId: string, engine: string) => {
    const key = rollupKey(promptId, engine);
    let counts = rollups.get(key);
    if (!counts) {
      counts = emptyCounts();
      rollups.set(key, counts);
    }
    return counts;
  };
  for (const answer of answers) {
    const targets = [
      countsFor(answer.promptId, answer.engine),
      countsFor(answer.promptId, ALL_ENGINES),
      countsFor(ALL_PROMPTS, answer.engine),
      countsFor(ALL_PROMPTS, ALL_ENGINES),
    ];
    if (answer.status !== 'extracted') {
      for (const counts of targets) {
        counts.failed++;
      }
      continue;
    }
    const mentions = answer.mentions ?? [];
    const own = mentions.find((mention) => mention.brandId === OWN_BRAND_ID);
    const tracked = mentions.filter((mention) => mention.brandId);
    const urls = (answer.citations ?? []).map((citation) => citation.url);
    const cited = citesDomain(urls, ownDomain);
    const domains = new Set(urls.map(hostOf).filter((host): host is string => Boolean(host)));
    for (const counts of targets) {
      counts.answers++;
      counts.trackedMentions += tracked.length;
      for (const mention of tracked) {
        counts.brandMentions[mention.brandId!] = (counts.brandMentions[mention.brandId!] ?? 0) + 1;
      }
      if (own) {
        counts.mentioned++;
        counts.positionSum += own.position;
        if (own.position === 1) {
          counts.firstMentions++;
        }
        if (own.recommended) {
          counts.recommended++;
        }
      }
      if (cited) {
        counts.cited++;
      }
      for (const domain of domains) {
        counts.citedDomains[domain] = (counts.citedDomains[domain] ?? 0) + 1;
      }
    }
  }
  return rollups;
}

const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;

export function topEntries(counts: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit),
  );
}

export function ratesOf(counts: Counts): Rates {
  return {
    mentionRate: ratio(counts.mentioned, counts.answers),
    firstMentionRate: ratio(counts.firstMentions, counts.answers),
    averagePosition: ratio(counts.positionSum, counts.mentioned),
    shareOfVoice: ratio(counts.mentioned, counts.trackedMentions),
    recommendedRate: ratio(counts.recommended, counts.answers),
    citationRate: ratio(counts.cited, counts.answers),
  };
}

export function summarize(rollups: Map<string, Counts>): RunSummary {
  const summary: RunSummary = {};
  for (const [key, counts] of rollups) {
    const [promptId, engine] = key.split('|');
    if (promptId === ALL_PROMPTS || engine === ALL_ENGINES) {
      continue;
    }
    summary[promptId] ??= {};
    summary[promptId][engine] = [counts.mentioned, counts.answers];
  }
  return summary;
}

export function findGapCandidates(rollups: Map<string, Counts>): GapCandidate[] {
  const byPrompt = new Map<string, { engine: string; counts: Counts }[]>();
  for (const [key, counts] of rollups) {
    const [promptId, engine] = key.split('|');
    if (promptId === ALL_PROMPTS || engine === ALL_ENGINES || counts.answers === 0) {
      continue;
    }
    byPrompt.set(promptId, [...(byPrompt.get(promptId) ?? []), { engine, counts }]);
  }
  const candidates: GapCandidate[] = [];
  for (const [promptId, engines] of byPrompt) {
    const missingEngines = engines
      .filter(
        ({ counts }) => (counts.answers - counts.mentioned) / counts.answers >= MISSING_THRESHOLD,
      )
      .map(({ engine }) => engine)
      .sort();
    const answers = engines.reduce((sum, { counts }) => sum + counts.answers, 0);
    const mentioned = engines.reduce((sum, { counts }) => sum + counts.mentioned, 0);
    const neverCited = engines.every(({ counts }) => counts.cited === 0);
    if (missingEngines.length || neverCited) {
      candidates.push({
        promptId,
        missingEngines,
        missingRate: Math.round(((answers - mentioned) / answers) * 10000) / 10000,
        neverCited,
      });
    }
  }
  return candidates.sort((left, right) => left.promptId.localeCompare(right.promptId));
}

export interface RunDiff {
  lost: { promptId: string; engine: string }[];
  gained: { promptId: string; engine: string }[];
}

export function diffSummaries(previous: RunSummary | undefined, current: RunSummary): RunDiff {
  const diff: RunDiff = { lost: [], gained: [] };
  if (!previous) {
    return diff;
  }
  for (const [promptId, engines] of Object.entries(current)) {
    for (const [engine, [mentioned, answers]] of Object.entries(engines)) {
      const before = previous[promptId]?.[engine];
      if (!before || before[1] === 0 || answers === 0) {
        continue;
      }
      if (before[0] > 0 && mentioned === 0) {
        diff.lost.push({ promptId, engine });
      } else if (before[0] === 0 && mentioned > 0) {
        diff.gained.push({ promptId, engine });
      }
    }
  }
  return diff;
}
