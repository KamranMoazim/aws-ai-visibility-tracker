import { createHash, randomUUID } from 'node:crypto';

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 16);

export const hashId = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
