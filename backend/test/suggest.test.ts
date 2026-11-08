import { app } from '../src/api/app.js';
import { filterSuggestions, sitemapPaths } from '../src/suggest/prompts.js';
import { check, finish } from './helpers.js';

const brand = { name: 'Acme Pay', domain: 'acmepay.io', aliases: ['AcmePay'] };
const kept = filterSuggestions(
  [
    { text: 'How do I invoice clients abroad?', stage: 'problem' },
    { text: 'Is Acme Pay good for agencies?', stage: 'comparison' },
    { text: 'how do i invoice clients abroad', stage: 'problem' },
    { text: 'Wise vs Payoneer for freelancers', stage: 'comparison' },
    { text: 'Best tool to bill in EUR and USD', stage: 'solution' },
  ],
  { brand },
  ['Best tool to bill in EUR and USD?'],
);
check(
  'suggestions drop brand mentions, duplicates and existing prompts',
  kept.map((suggestion) => suggestion.text).join('|') ===
    'How do I invoice clients abroad?|Wise vs Payoneer for freelancers',
  kept,
);
check(
  'sitemap paths parsed without the home page',
  sitemapPaths(
    '<urlset><url><loc>https://acmepay.io/</loc></url><url><loc> https://acmepay.io/pricing </loc></url>' +
      '<url><loc>https://acmepay.io/pricing</loc></url><url><loc>bad</loc></url></urlset>',
  ).join() === '/pricing',
);

process.env.AWS_LAMBDA_FUNCTION_NAME = 'offline-test';
const health = await app.request('/health');
check('health is open', health.status === 200);
const anonymous = await app.request('/workspaces');
check('workspaces need a signed-in user', anonymous.status === 401, await anonymous.text());
const forged = await app.request('/workspaces', {
  headers: { authorization: 'Bearer forged.token.value' },
});
check('bearer tokens are not trusted inside lambda', forged.status === 401);
const unknown = await app.request('/nope');
check(
  'unknown routes are 404 json',
  unknown.status === 404 && (await unknown.json()).error === 'not_found',
);
finish();
