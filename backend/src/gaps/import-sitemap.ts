import { fetchPage, htmlToText } from '../core/fetcher.js';
import { bareDomain } from '../core/prompts.js';
import type { Workspace } from '../core/schemas.js';
import { putPages, setSitemapImport } from '../data/pages.js';
import { MAX_CHILD_SITEMAPS, MAX_PAGES, onDomain, parseSitemap } from './sitemap.js';

const TITLE_FETCHES = 150;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 4 * 60 * 1000;

export async function importSitemap(workspace: Workspace): Promise<number> {
  const startedAt = Date.now();
  const origin = `https://${bareDomain(workspace.brand.domain)}`;
  await setSitemapImport(workspace.workspaceId, {
    status: 'running',
    at: new Date().toISOString(),
  });
  const root = parseSitemap((await fetchPage(`${origin}/sitemap.xml`)).body);
  const urls = new Set(root.urls);
  for (const child of root.sitemaps
    .filter((url) => onDomain(url, workspace.brand.domain))
    .slice(0, MAX_CHILD_SITEMAPS)) {
    try {
      parseSitemap((await fetchPage(child)).body).urls.forEach((url) => urls.add(url));
    } catch (error) {
      console.error(`sitemap child failed url=${child} ${(error as Error).message}`);
    }
  }
  const pages = [...urls]
    .filter((url) => onDomain(url, workspace.brand.domain))
    .slice(0, MAX_PAGES)
    .map((url) => ({
      url,
      title: undefined as string | undefined,
      description: undefined as string | undefined,
    }));

  let next = 0;
  async function worker() {
    while (
      next < Math.min(pages.length, TITLE_FETCHES) &&
      Date.now() - startedAt < TIME_BUDGET_MS
    ) {
      const page = pages[next++];
      try {
        const text = htmlToText((await fetchPage(page.url)).body, page.url);
        page.title = text.title || undefined;
        page.description = text.description || undefined;
      } catch {
        page.title = undefined;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const importedAt = new Date().toISOString();
  await putPages(
    workspace.workspaceId,
    pages.map((page) => ({ ...page, importedAt })),
  );
  await setSitemapImport(workspace.workspaceId, {
    status: 'done',
    pages: pages.length,
    at: importedAt,
  });
  return pages.length;
}
