import type { Post } from '../data/posts.js';

const PLACEHOLDER = /\[fill in[^\]]*\]/gi;

export function findPlaceholders(
  post: Pick<Post, 'title' | 'description' | 'markdown' | 'faq'>,
): string[] {
  const fields = [
    post.title,
    post.description,
    post.markdown,
    ...post.faq.flatMap((pair) => [pair.question, pair.answer]),
  ];
  return fields.flatMap((field) => field.match(PLACEHOLDER) ?? []);
}
