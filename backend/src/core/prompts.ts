export interface BrandTerms {
  name: string;
  domain?: string;
  aliases?: string[];
}

const normalize = (text: string) =>
  ` ${text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

export function domainLabel(domain: string): string {
  const host = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  return host.split('.')[0] ?? host;
}

export function brandTermsOf(brand: BrandTerms): string[] {
  const terms = [brand.name, ...(brand.aliases ?? [])];
  if (brand.domain) {
    terms.push(brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, ''));
    terms.push(domainLabel(brand.domain));
  }
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))];
}

export function findBrandTerms(prompt: string, brand: BrandTerms): string[] {
  const haystack = normalize(prompt);
  return brandTermsOf(brand).filter((term) => haystack.includes(normalize(term)));
}
