import type { GuideEntry } from './render.js';

export interface ManifestEntry extends GuideEntry {
  postId: string;
}

export class SlugTaken extends Error {
  constructor(slug: string) {
    super(`The address /guides/${slug}/ is already used by another guide`);
    this.name = 'SlugTaken';
  }
}

export function upsertEntry(entries: ManifestEntry[], entry: ManifestEntry): ManifestEntry[] {
  const clash = entries.find(
    (existing) => existing.slug === entry.slug && existing.postId !== entry.postId,
  );
  if (clash) {
    throw new SlugTaken(entry.slug);
  }
  return [...entries.filter((existing) => existing.postId !== entry.postId), entry].sort(
    (left, right) => left.slug.localeCompare(right.slug),
  );
}

export function removeEntry(entries: ManifestEntry[], postId: string): ManifestEntry[] {
  return entries.filter((existing) => existing.postId !== postId);
}
