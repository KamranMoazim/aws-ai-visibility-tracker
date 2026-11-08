export interface BrandTerms {
  name: string;
  domain?: string;
  aliases?: string[];
}

export const normalize = (text: string) =>
  ` ${text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

export function domainLabel(domain: string): string {
  const host = bareDomain(domain);
  return host.split('.')[0] ?? host;
}

export const bareDomain = (domain: string) =>
  domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');

export function brandTermsOf(brand: BrandTerms, includeDomainLabel = true): string[] {
  const terms = [brand.name, ...(brand.aliases ?? [])];
  if (brand.domain) {
    terms.push(bareDomain(brand.domain));
    if (includeDomainLabel) {
      terms.push(domainLabel(brand.domain));
    }
  }
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))];
}

export function findBrandTerms(prompt: string, brand: BrandTerms): string[] {
  const haystack = normalize(prompt);
  return brandTermsOf(brand).filter((term) => haystack.includes(normalize(term)));
}
