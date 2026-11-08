import type { ReactNode } from 'react';
import type { Brand, Competitor, Mention } from './api';

type Kind = 'own' | 'competitor' | 'untracked';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termsFor(brand: Brand, competitors: Competitor[], mentions: Mention[]) {
  const terms: { term: string; kind: Kind }[] = [];
  const add = (term: string | undefined, kind: Kind) => {
    if (term && term.trim().length >= 2) {
      terms.push({ term: term.trim(), kind });
    }
  };
  add(brand.name, 'own');
  brand.aliases.forEach((alias) => add(alias, 'own'));
  add(brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, ''), 'own');
  for (const competitor of competitors) {
    add(competitor.name, 'competitor');
    competitor.aliases.forEach((alias) => add(alias, 'competitor'));
    add(competitor.domain, 'competitor');
  }
  mentions
    .filter((mention) => !mention.brandId)
    .forEach((mention) => add(mention.name, 'untracked'));
  return terms.sort((left, right) => right.term.length - left.term.length);
}

export function HighlightedText({
  text,
  brand,
  competitors,
  mentions,
}: {
  text: string;
  brand: Brand;
  competitors: Competitor[];
  mentions: Mention[];
}) {
  const terms = termsFor(brand, competitors, mentions);
  if (!terms.length) {
    return <>{text}</>;
  }
  const kindOf = new Map(terms.map((entry) => [entry.term.toLowerCase(), entry.kind]));
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(${terms.map((entry) => escape(entry.term)).join('|')})(?![A-Za-z0-9])`,
    'gi',
  );
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    parts.push(text.slice(last, start));
    const kind = kindOf.get(match[0].toLowerCase()) ?? 'competitor';
    parts.push(
      <mark key={start} className={`brand-${kind}`}>
        {match[0]}
      </mark>,
    );
    last = start + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
