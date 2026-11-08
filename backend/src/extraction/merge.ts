import { brandKeyOf, mapNameToBrand, matchBrands, type TrackedBrand } from '../core/matcher.js';
import { normalize } from '../core/prompts.js';

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface ExtractedBrand {
  name: string;
  recommended: boolean;
  sentiment: Sentiment;
}

export interface Mention {
  key: string;
  name: string;
  brandId?: string;
  position: number;
  recommended: boolean;
  sentiment: Sentiment;
  source: 'both' | 'matcher' | 'llm';
}

export interface Disagreement {
  onlyMatcher: string[];
  onlyLlm: string[];
}

export interface MergedExtraction {
  mentions: Mention[];
  disagreement?: Disagreement;
}

interface Entry {
  key: string;
  name: string;
  brandId?: string;
  index: number;
  order: number;
  recommended: boolean;
  sentiment: Sentiment;
  fromMatcher: boolean;
  fromLlm: boolean;
}

export function mergeExtraction(
  text: string,
  brands: TrackedBrand[],
  llmBrands: ExtractedBrand[] | undefined,
): MergedExtraction {
  const haystack = normalize(text);
  const entries = new Map<string, Entry>();
  for (const match of matchBrands(text, brands)) {
    const brand = brands.find((candidate) => candidate.brandId === match.brandId)!;
    entries.set(brand.brandId, {
      key: brand.brandId,
      name: brand.name,
      brandId: brand.brandId,
      index: match.index,
      order: entries.size,
      recommended: false,
      sentiment: 'neutral',
      fromMatcher: true,
      fromLlm: false,
    });
  }
  (llmBrands ?? []).forEach((extracted, order) => {
    const tracked = mapNameToBrand(extracted.name, brands);
    const key = tracked?.brandId ?? `x:${brandKeyOf(extracted.name)}`;
    if (key === 'x:') {
      return;
    }
    const existing = entries.get(key);
    if (existing) {
      existing.recommended ||= extracted.recommended;
      existing.sentiment = extracted.sentiment;
      existing.fromLlm = true;
      return;
    }
    const found = haystack.indexOf(normalize(extracted.name));
    entries.set(key, {
      key,
      name: tracked?.name ?? extracted.name.trim(),
      brandId: tracked?.brandId,
      index: found >= 0 ? found : Number.MAX_SAFE_INTEGER,
      order: 1000 + order,
      recommended: extracted.recommended,
      sentiment: extracted.sentiment,
      fromMatcher: false,
      fromLlm: true,
    });
  });

  const mentions = [...entries.values()]
    .sort((left, right) => left.index - right.index || left.order - right.order)
    .map(
      (entry, position): Mention => ({
        key: entry.key,
        name: entry.name,
        brandId: entry.brandId,
        position: position + 1,
        recommended: entry.recommended,
        sentiment: entry.sentiment,
        source: entry.fromMatcher && entry.fromLlm ? 'both' : entry.fromMatcher ? 'matcher' : 'llm',
      }),
    );
  if (!llmBrands) {
    return { mentions };
  }
  const tracked = mentions.filter((mention) => mention.brandId);
  const onlyMatcher = tracked
    .filter((mention) => mention.source === 'matcher')
    .map((mention) => mention.key);
  const onlyLlm = tracked
    .filter((mention) => mention.source === 'llm')
    .map((mention) => mention.key);
  return {
    mentions,
    disagreement: onlyMatcher.length || onlyLlm.length ? { onlyMatcher, onlyLlm } : undefined,
  };
}
