import { decodeEntities } from '../core/fetcher.js';
import { bareDomain } from '../core/prompts.js';

export const MAX_PAGES = 500;
export const MAX_CHILD_SITEMAPS = 5;

export interface ParsedSitemap {
  urls: string[];
  sitemaps: string[];
}

export function parseSitemap(xml: string): ParsedSitemap {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    decodeEntities(match[1]),
  );
  if (/<sitemapindex\b/i.test(xml)) {
    return { urls: [], sitemaps: locs };
  }
  return { urls: locs, sitemaps: [] };
}

export function onDomain(url: string, domain: string): boolean {
  try {
    const host = bareDomain(new URL(url).hostname);
    const target = bareDomain(domain);
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}
