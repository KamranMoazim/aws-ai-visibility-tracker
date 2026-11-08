import { bareDomain, brandTermsOf, normalize } from './prompts.js';
import { slugify } from './ids.js';

export interface TrackedBrand {
  brandId: string;
  name: string;
  domain?: string;
  aliases?: string[];
  own?: boolean;
}

export interface TextMatch {
  brandId: string;
  index: number;
}

export const OWN_BRAND_ID = 'own';

function termIndex(haystack: string, term: string): number {
  const needle = normalize(term);
  return needle.trim() ? haystack.indexOf(needle) : -1;
}

export function firstIndexOf(haystack: string, brand: TrackedBrand): number {
  let best = -1;
  for (const term of brandTermsOf(brand, false)) {
    const index = termIndex(haystack, term);
    if (index >= 0 && (best < 0 || index < best)) {
      best = index;
    }
  }
  return best;
}

export function matchBrands(text: string, brands: TrackedBrand[]): TextMatch[] {
  const haystack = normalize(text);
  return brands
    .map((brand) => ({ brandId: brand.brandId, index: firstIndexOf(haystack, brand) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);
}

export function mapNameToBrand(name: string, brands: TrackedBrand[]): TrackedBrand | undefined {
  const candidate = normalize(name);
  return brands.find((brand) =>
    brandTermsOf(brand, false).some((term) => {
      const normalized = normalize(term);
      return candidate === normalized || candidate.includes(normalized);
    }),
  );
}

export function hostOf(url: string): string | undefined {
  try {
    return bareDomain(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

export function citesDomain(urls: string[], domain: string | undefined): boolean {
  if (!domain) {
    return false;
  }
  const target = bareDomain(domain);
  return urls.some((url) => {
    const host = hostOf(url);
    return host !== undefined && (host === target || host.endsWith(`.${target}`));
  });
}

export const brandKeyOf = (name: string) => slugify(name);
