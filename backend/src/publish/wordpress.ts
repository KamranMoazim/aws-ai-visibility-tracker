import { sendJson } from '../core/fetcher.js';
import { getSecret } from '../core/ssm.js';

export const WORDPRESS_PASSWORD_PARAMETER = '/answershare/wordpress-app-password';

export interface WordPressSettings {
  siteUrl: string;
  username: string;
  postStatus: 'draft' | 'publish';
}

export interface WordPressResult {
  id: number;
  link: string;
}

export async function publishToWordPress(
  settings: WordPressSettings,
  post: { title: string; description: string; slug: string; html: string; wordpressId?: number },
): Promise<WordPressResult> {
  const password = await getSecret(WORDPRESS_PASSWORD_PARAMETER);
  if (!password) {
    throw new Error('No WordPress application password stored; run scripts/set-keys.sh');
  }
  const base = new URL(settings.siteUrl).origin;
  const path = post.wordpressId
    ? `/wp-json/wp/v2/posts/${post.wordpressId}`
    : '/wp-json/wp/v2/posts';
  const response = await sendJson(
    `${base}${path}`,
    'POST',
    {
      authorization: `Basic ${Buffer.from(`${settings.username}:${password}`).toString('base64')}`,
    },
    {
      title: post.title,
      slug: post.slug,
      excerpt: post.description,
      content: post.html,
      status: settings.postStatus,
    },
  );
  const body = response.body as { id?: number; link?: string; message?: string };
  if (response.status >= 300 || !body.id) {
    throw new Error(`WordPress returned ${response.status}: ${body.message ?? 'no post id'}`);
  }
  return { id: body.id, link: body.link ?? `${base}/?p=${body.id}` };
}
