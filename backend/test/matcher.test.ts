import {
  citesDomain,
  hostOf,
  mapNameToBrand,
  matchBrands,
  type TrackedBrand,
} from '../src/core/matcher.js';
import { mergeExtraction } from '../src/extraction/merge.js';
import { parseExtractionResponse } from '../src/extraction/nova-extractor.js';
import { check, finish, fixture } from './helpers.js';

const { brands } = fixture('labelled/answers.json') as { brands: TrackedBrand[] };

check(
  'matches in order of first appearance',
  matchBrands('Payoneer first, then wise.com, then Acme Pay', brands)
    .map((match) => match.brandId)
    .join() === 'payoneer,wise,own',
);
check('alias counts as the brand', matchBrands('Try TransferWise', brands)[0]?.brandId === 'wise');
check('possessive matches', matchBrands("Stripe's API", brands)[0]?.brandId === 'stripe');
check(
  'brand inside a longer word does not match',
  matchBrands('the Wiseman Group and Stripes Ltd', brands).length === 0,
);
check(
  'domain label alone is not a matcher term',
  matchBrands('you can pay later', [{ brandId: 'n', name: 'Northwind', domain: 'pay.com' }])
    .length === 0 &&
    matchBrands('see pay.com', [{ brandId: 'n', name: 'Northwind', domain: 'pay.com' }]).length ===
      1,
);
check(
  'llm names map to tracked brands',
  mapNameToBrand('Wise Business', brands)?.brandId === 'wise' &&
    mapNameToBrand('Revolut Business account', brands)?.brandId === 'revolut' &&
    mapNameToBrand('Monzo', brands) === undefined,
);
check('host of url strips www', hostOf('https://www.wise.com/gb/') === 'wise.com');
check(
  'citations on a subdomain count for the domain',
  citesDomain(['https://help.acmepay.io/fees'], 'acmepay.io') &&
    !citesDomain(['https://notacmepay.io/'], 'acmepay.io') &&
    !citesDomain(['https://wise.com'], undefined),
);

const text = 'Wise is popular. Unlike PayPal, Monzo Business is free. Payoneer suits marketplaces.';
const merged = mergeExtraction(text, brands, [
  { name: 'Wise', recommended: true, sentiment: 'positive' },
  { name: 'PayPal', recommended: false, sentiment: 'negative' },
  { name: 'Monzo Business', recommended: true, sentiment: 'positive' },
]);
check(
  'merged order follows the text',
  merged.mentions.map((mention) => mention.key).join() === 'wise,paypal,x:monzo-business,payoneer',
  merged.mentions,
);
check(
  'positions are 1-based',
  merged.mentions.map((mention) => mention.position).join() === '1,2,3,4',
);
check(
  'llm supplies recommended and sentiment',
  merged.mentions[0].recommended && merged.mentions[1].sentiment === 'negative',
);
check(
  'untracked brand kept without brand id',
  merged.mentions[2].brandId === undefined && merged.mentions[2].name === 'Monzo Business',
);
check(
  'disagreement flagged when only the matcher saw a tracked brand',
  merged.disagreement?.onlyMatcher.join() === 'payoneer' &&
    merged.disagreement.onlyLlm.length === 0,
  merged.disagreement,
);
const agreed = mergeExtraction('Wise only', brands, [
  { name: 'Wise', recommended: false, sentiment: 'neutral' },
]);
check('no disagreement when both agree', agreed.disagreement === undefined);
const matcherOnly = mergeExtraction(text, brands, undefined);
check(
  'matcher-only extraction has no disagreement and no recommendations',
  matcherOnly.disagreement === undefined &&
    matcherOnly.mentions.every((mention) => !mention.recommended && mention.brandId),
);
const llmOnly = mergeExtraction('The leading European neobank is popular.', brands, [
  { name: 'Revolut', recommended: false, sentiment: 'neutral' },
]);
check(
  'brand only the llm saw is placed last and flagged',
  llmOnly.mentions[0]?.key === 'revolut' && llmOnly.disagreement?.onlyLlm.join() === 'revolut',
  llmOnly,
);

const toolResponse = {
  output: {
    message: {
      content: [
        {
          toolUse: {
            name: 'record_brands',
            input: {
              brands: [
                { name: 'Wise', recommended: true, sentiment: 'positive' },
                { name: 'PayPal', recommended: false, sentiment: 'mixed' },
              ],
            },
          },
        },
      ],
    },
  },
};
const parsed = parseExtractionResponse(toolResponse);
check(
  'tool output parsed, unknown sentiment falls back to neutral',
  parsed.length === 2 && parsed[1].sentiment === 'neutral',
  parsed,
);
let threw = false;
try {
  parseExtractionResponse({ output: { message: { content: [{ text: 'no tool' }] } } });
} catch {
  threw = true;
}
check('missing tool call is an error', threw);
finish();
