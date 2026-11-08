import { citesDomain, hostOf } from '../core/matcher.js';
import type { AnswerRecord } from '../data/answers.js';

export const TOP_SOURCES = 3;
const MAX_EXCERPTS = 6;
const EXCERPT_CHARS = 1200;

export interface CitedSource {
  url: string;
  title?: string;
  count: number;
}

export interface Evidence {
  answers: number;
  competitors: { name: string; count: number }[];
  others: { name: string; count: number }[];
  sources: CitedSource[];
  excerpts: { engine: string; text: string }[];
}

export function buildEvidence(answers: AnswerRecord[], ownDomain: string): Evidence {
  const read = answers.filter((answer) => answer.status === 'extracted');
  const competitors = new Map<string, number>();
  const others = new Map<string, number>();
  const sources = new Map<string, CitedSource>();
  for (const answer of read) {
    for (const mention of answer.mentions ?? []) {
      if (mention.brandId === 'own') {
        continue;
      }
      const target = mention.brandId ? competitors : others;
      target.set(mention.name, (target.get(mention.name) ?? 0) + 1);
    }
    const seen = new Set<string>();
    for (const citation of answer.citations ?? []) {
      if (
        seen.has(citation.url) ||
        citesDomain([citation.url], ownDomain) ||
        !hostOf(citation.url)
      ) {
        continue;
      }
      seen.add(citation.url);
      const source = sources.get(citation.url) ?? {
        url: citation.url,
        title: citation.title,
        count: 0,
      };
      source.count++;
      source.title ??= citation.title;
      sources.set(citation.url, source);
    }
  }
  const ranked = (counts: Map<string, number>) =>
    [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  return {
    answers: read.length,
    competitors: ranked(competitors),
    others: ranked(others).slice(0, 10),
    sources: [...sources.values()].sort(
      (left, right) => right.count - left.count || left.url.localeCompare(right.url),
    ),
    excerpts: read
      .filter((answer) => !(answer.mentions ?? []).some((mention) => mention.brandId === 'own'))
      .slice(0, MAX_EXCERPTS)
      .map((answer) => ({
        engine: answer.engine,
        text: (answer.text ?? '').slice(0, EXCERPT_CHARS),
      })),
  };
}
