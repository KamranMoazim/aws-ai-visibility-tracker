import { checkRobotsText } from '../src/publish/crawlers.js';
import { normalizeDraft } from '../src/publish/draft.js';
import {
  removeEntry,
  SlugTaken,
  upsertEntry,
  type ManifestEntry,
} from '../src/publish/manifest.js';
import { markdownToHtml, renderInline } from '../src/publish/markdown.js';
import { findPlaceholders } from '../src/publish/placeholders.js';
import {
  jsonForScript,
  renderGuide,
  renderLlmsTxt,
  renderRobots,
  renderSitemap,
} from '../src/publish/render.js';
import { check, finish } from './helpers.js';

const evil = markdownToHtml(
  '## Fees <script>alert(1)</script>\n\nClick [here](javascript:alert(1)) or [docs](https://acmepay.io/docs?a=1&b=2).\n\n<img src=x onerror=alert(1)>\n\n- **bold** and *em*\n- `<b>code</b>`\n\n1. one\n2. two\n\n```\n<script>x</script>\n```',
);
check(
  'script tags escaped',
  !evil.html.includes('<script') && evil.html.includes('&lt;script&gt;'),
  evil.html,
);
check('raw html escaped', !evil.html.includes('<img') && evil.html.includes('&lt;img'), evil.html);
check(
  'javascript links dropped',
  !evil.html.includes('javascript:') && evil.html.includes('Click here'),
  evil.html,
);
check(
  'https links kept with escaped query',
  evil.html.includes('<a href="https://acmepay.io/docs?a=1&amp;b=2">docs</a>'),
  evil.html,
);
check(
  'emphasis and lists',
  evil.html.includes('<li><strong>bold</strong> and <em>em</em></li>') &&
    evil.html.includes('<ol><li>one</li><li>two</li></ol>'),
);
check(
  'inline code escaped, not formatted',
  evil.html.includes('<code>&lt;b&gt;code&lt;/b&gt;</code>'),
  evil.html,
);
check(
  'fenced code escaped',
  evil.html.includes('<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>'),
);
check('headings collected', evil.headings[0]?.level === 2);
check('h1 not produced from markdown', !markdownToHtml('# Title').html.includes('<h1>'));
check(
  'attribute breakout escaped',
  !renderInline('[x](https://a.com/"onmouseover="alert(1))').includes('" onmouseover'),
);

check(
  'json in script cannot close the tag',
  !jsonForScript({ text: '</script><script>alert(1)</script>' }).includes('</script'),
);
const now = '2026-11-08T10:00:00.000Z';
const html = renderGuide({
  slug: 'invoice-international-clients',
  title: 'How to invoice international clients </title>',
  description: 'Fees, currencies & payout times compared.',
  publishedAt: now,
  updatedAt: now,
  markdown: '## Fees\n\nCompare FX margins.',
  faq: [{ question: 'What does it cost?', answer: 'It depends on the **currency**.' }],
  siteName: 'Acme Pay',
  baseUrl: 'https://d1.cloudfront.net',
});
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
  (match) => JSON.parse(match[1]),
);
check(
  'article and faq json-ld parse',
  blocks.length === 2 && blocks[0]['@type'] === 'Article' && blocks[1]['@type'] === 'FAQPage',
  blocks,
);
check(
  'faq json-ld is plain text',
  blocks[1].mainEntity[0].acceptedAnswer.text === 'It depends on the currency.',
  blocks[1],
);
check(
  'title escaped in html',
  html.includes('How to invoice international clients &lt;/title&gt;'),
);
check(
  'canonical url',
  html.includes(
    '<link rel="canonical" href="https://d1.cloudfront.net/guides/invoice-international-clients/">',
  ),
);
check('no executable scripts in guide', !/<script(?![^>]*application\/ld\+json)/.test(html));

const entries = [
  { slug: 'a-b', title: 'A & B', description: 'Desc', publishedAt: now, updatedAt: now },
];
const sitemap = renderSitemap('https://d1.cloudfront.net', entries);
check(
  'sitemap lists guides with lastmod',
  sitemap.includes(
    '<loc>https://d1.cloudfront.net/guides/a-b/</loc><lastmod>2026-11-08</lastmod>',
  ) && sitemap.startsWith('<?xml'),
  sitemap,
);
const llms = renderLlmsTxt('Acme Pay', 'https://d1.cloudfront.net', entries);
check(
  'llms.txt links each guide',
  llms.startsWith('# Acme Pay') &&
    llms.includes('- [A & B](https://d1.cloudfront.net/guides/a-b/): Desc'),
  llms,
);
check(
  'robots allows guides and points at the sitemap',
  renderRobots('https://d1.cloudfront.net').includes('Allow: /guides/') &&
    renderRobots('https://d1.cloudfront.net').includes(
      'Sitemap: https://d1.cloudfront.net/sitemap.xml',
    ),
);
check(
  'our robots lets AI search crawlers read guides',
  checkRobotsText(renderRobots('https://x'), '/guides/a/').every((crawler) => crawler.allowed),
);
const blocking = checkRobotsText(
  'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n',
  '/blog',
);
check(
  'crawler check flags a blocked bot',
  blocking.find((crawler) => crawler.agent === 'OAI-SearchBot')?.allowed === false &&
    blocking.find((crawler) => crawler.agent === 'PerplexityBot')?.allowed === true,
  blocking,
);
check(
  'missing robots allows all',
  checkRobotsText(undefined, '/').every((crawler) => crawler.allowed),
);

const entry = (postId: string, slug: string): ManifestEntry => ({
  postId,
  slug,
  title: slug,
  description: '',
  publishedAt: now,
  updatedAt: now,
});
const manifest = upsertEntry(upsertEntry([], entry('p1', 'one')), entry('p2', 'two'));
check('manifest upserts', manifest.length === 2);
check(
  'republish replaces its own entry',
  upsertEntry(manifest, entry('p1', 'one-renamed')).length === 2,
);
let clashed = false;
try {
  upsertEntry(manifest, entry('p3', 'two'));
} catch (error) {
  clashed = error instanceof SlugTaken;
}
check('slug used by another guide is refused', clashed);
check(
  'unpublish removes the entry',
  removeEntry(manifest, 'p1')
    .map((item) => item.postId)
    .join() === 'p2',
);

const post = {
  title: 'Fees for [fill in] currencies',
  description: 'ok description',
  markdown: 'Our fee is [fill in: percent]. Payouts take [Fill In].',
  faq: [{ question: 'How long?', answer: '[fill in]' }],
};
check('all placeholders found', findPlaceholders(post).length === 4, findPlaceholders(post));
check(
  'no placeholders once filled',
  findPlaceholders({ title: 'Fees', description: 'd', markdown: 'Fee is 1%.', faq: [] }).length ===
    0,
);

const draft = normalizeDraft({
  title: 'Invoice International Clients: A Guide',
  slug: '',
  description: 'How to bill clients abroad.',
  markdown: '# Should be removed\n\n## Start\n\nText',
  faq: [],
});
check(
  'draft slug derived from title',
  draft.slug === 'invoice-international-clients-a-guide',
  draft.slug,
);
check('draft h1 stripped', draft.markdown.startsWith('## Start'), draft.markdown);
finish();
