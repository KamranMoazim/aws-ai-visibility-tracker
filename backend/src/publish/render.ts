import { escapeHtml, markdownToHtml, renderInline } from './markdown.js';

export interface FaqPair {
  question: string;
  answer: string;
}

export interface GuideEntry {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
}

export interface GuideInput extends GuideEntry {
  markdown: string;
  faq: FaqPair[];
  siteName: string;
  baseUrl: string;
}

export const GUIDES_PATH = 'guides';
export const guideUrl = (baseUrl: string, slug: string) => `${baseUrl}/${GUIDES_PATH}/${slug}/`;
export const guideKey = (slug: string) => `${GUIDES_PATH}/${slug}/index.html`;

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}

const plain = (text: string) =>
  text
    .replace(/[*_`#>[\]]/g, '')
    .replace(/\(([^)]+)\)/g, '')
    .trim();

const STYLE = `
:root{color-scheme:light dark;--paper:#fbfbfa;--ink:#17202c;--muted:#5d6676;--rule:#dde1e7;--link:#23467a}
@media (prefers-color-scheme:dark){:root{--paper:#13171d;--ink:#e7ebf1;--muted:#a3acbb;--rule:#2c333e;--link:#8fb3ec}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.65 Charter,'Iowan Old Style',Georgia,serif}
main{max-width:42rem;margin:0 auto;padding:3rem 1.25rem 4rem}a{color:var(--link)}
h1{font-size:2.1rem;line-height:1.2;margin:0 0 .75rem}h2{font-size:1.4rem;margin:2.2rem 0 .5rem}h3{font-size:1.15rem}
.lede{color:var(--muted);font-size:1.15rem}.meta{color:var(--muted);font:14px/1.4 system-ui,sans-serif;margin-bottom:2rem}
pre{overflow-x:auto;padding:1rem;border:1px solid var(--rule);border-radius:6px}code{font-size:.9em}
blockquote{margin:0;padding-left:1rem;border-left:3px solid var(--rule);color:var(--muted)}
.faq dt{font-weight:700;margin-top:1.25rem}.faq dd{margin:.25rem 0 0}
nav{font:14px/1.4 system-ui,sans-serif}ul.guides{list-style:none;padding:0}ul.guides li{padding:1rem 0;border-bottom:1px solid var(--rule)}
`.trim();

function page(
  title: string,
  description: string,
  canonical: string,
  body: string,
  jsonLd: unknown[],
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(canonical)}">
<style>${STYLE}</style>
${jsonLd.map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`).join('\n')}
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

export function articleJsonLd(input: GuideInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    mainEntityOfPage: guideUrl(input.baseUrl, input.slug),
    publisher: { '@type': 'Organization', name: input.siteName },
    author: { '@type': 'Organization', name: input.siteName },
  };
}

export function faqJsonLd(faq: FaqPair[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((pair) => ({
      '@type': 'Question',
      name: plain(pair.question),
      acceptedAnswer: { '@type': 'Answer', text: plain(pair.answer) },
    })),
  };
}

export function renderGuide(input: GuideInput): string {
  const { html } = markdownToHtml(input.markdown);
  const canonical = guideUrl(input.baseUrl, input.slug);
  const faq = input.faq.length
    ? `<section><h2>Questions</h2><dl class="faq">${input.faq
        .map(
          (pair) => `<dt>${renderInline(pair.question)}</dt><dd>${renderInline(pair.answer)}</dd>`,
        )
        .join('')}</dl></section>`
    : '';
  const updated = input.updatedAt.slice(0, 10);
  const body = `<nav><a href="/${GUIDES_PATH}/">${escapeHtml(input.siteName)} guides</a></nav>
<article>
<h1>${escapeHtml(input.title)}</h1>
<p class="lede">${escapeHtml(input.description)}</p>
<p class="meta">Updated <time datetime="${escapeHtml(input.updatedAt)}">${escapeHtml(updated)}</time></p>
${html}
${faq}
</article>`;
  const jsonLd: unknown[] = [articleJsonLd(input)];
  if (input.faq.length) {
    jsonLd.push(faqJsonLd(input.faq));
  }
  return page(input.title, input.description, canonical, body, jsonLd);
}

export function renderIndex(siteName: string, baseUrl: string, entries: GuideEntry[]): string {
  const sorted = [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const body = `<h1>${escapeHtml(siteName)} guides</h1>
<ul class="guides">${sorted
    .map(
      (entry) =>
        `<li><a href="/${GUIDES_PATH}/${escapeHtml(entry.slug)}/">${escapeHtml(entry.title)}</a><br>${escapeHtml(entry.description)}</li>`,
    )
    .join('')}</ul>`;
  return page(
    `${siteName} guides`,
    `Guides from ${siteName}`,
    `${baseUrl}/${GUIDES_PATH}/`,
    body,
    [],
  );
}

export function renderSitemap(baseUrl: string, entries: GuideEntry[]): string {
  const urls = [
    `<url><loc>${escapeHtml(`${baseUrl}/${GUIDES_PATH}/`)}</loc></url>`,
    ...entries.map(
      (entry) =>
        `<url><loc>${escapeHtml(guideUrl(baseUrl, entry.slug))}</loc><lastmod>${escapeHtml(entry.updatedAt.slice(0, 10))}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderLlmsTxt(siteName: string, baseUrl: string, entries: GuideEntry[]): string {
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
  return [
    `# ${oneLine(siteName)}`,
    '',
    `> Guides published by ${oneLine(siteName)}.`,
    '',
    '## Guides',
    '',
    ...entries.map(
      (entry) =>
        `- [${oneLine(entry.title)}](${guideUrl(baseUrl, entry.slug)}): ${oneLine(entry.description)}`,
    ),
    '',
  ].join('\n');
}

export function renderRobots(baseUrl: string): string {
  return `User-agent: *\nAllow: /${GUIDES_PATH}/\nAllow: /llms.txt\nDisallow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}
