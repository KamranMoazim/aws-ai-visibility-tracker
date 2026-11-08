import { brandTermsOf, domainLabel, findBrandTerms } from '../src/core/prompts.js';
import { check, finish } from './helpers.js';

const brand = { name: 'Acme Pay', domain: 'https://www.acmepay.io', aliases: ['AcmePay', 'Acme'] };

check(
  'clean buyer prompt passes',
  findBrandTerms("What's the easiest way to invoice international clients?", brand).length === 0,
);
check(
  'name found case-insensitively',
  findBrandTerms('is ACME PAY any good', brand).includes('Acme Pay'),
);
check('possessive found', findBrandTerms("what are Acme's fees", brand).includes('Acme'));
check(
  'curly possessive found',
  findBrandTerms('what are Acme\u2019s fees', brand).includes('Acme'),
);
check(
  'domain found',
  findBrandTerms('compare acmepay.io and wise.com', brand).includes('acmepay.io'),
);
check('hyphenated name found', findBrandTerms('acme-pay vs wise', brand).includes('Acme Pay'));
check(
  'no match inside a longer word',
  findBrandTerms('acmeology tools for invoices', brand).length === 0,
);
check(
  'alias at end of sentence',
  findBrandTerms('Should I use AcmePay.', brand).includes('AcmePay'),
);
check('domain label', domainLabel('https://www.acmepay.io/pricing') === 'acmepay');
check(
  'terms include domain and label once',
  brandTermsOf(brand).filter((term) => term === 'acmepay').length === 1 &&
    brandTermsOf(brand).includes('acmepay.io'),
  brandTermsOf(brand),
);
finish();
