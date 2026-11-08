import { fetchRobots, isPathAllowed, parseRobots } from '../core/fetcher.js';
import { bareDomain } from '../core/prompts.js';

export const AI_CRAWLERS = ['OAI-SearchBot', 'PerplexityBot', 'GPTBot'] as const;

export interface CrawlerCheck {
  domain: string;
  path: string;
  robotsFound: boolean;
  crawlers: { agent: string; allowed: boolean }[];
}

export function checkRobotsText(text: string | undefined, path: string) {
  return AI_CRAWLERS.map((agent) => ({
    agent,
    allowed: text === undefined || isPathAllowed(parseRobots(text, agent), path),
  }));
}

export async function checkCrawlers(siteUrl: string, path = '/'): Promise<CrawlerCheck> {
  const origin = new URL(siteUrl).origin;
  const text = await fetchRobots(origin).catch(() => undefined);
  return {
    domain: bareDomain(origin),
    path,
    robotsFound: text !== undefined,
    crawlers: checkRobotsText(text, path),
  };
}
