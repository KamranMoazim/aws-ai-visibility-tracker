import { useEffect, useState } from 'react';

export type RouteView =
  | { page: 'home' }
  | { page: 'workspace'; workspaceId: string }
  | { page: 'settings'; workspaceId: string }
  | { page: 'gaps'; workspaceId: string }
  | { page: 'gap'; workspaceId: string; gapId: string }
  | { page: 'posts'; workspaceId: string }
  | { page: 'post'; workspaceId: string; postId: string }
  | { page: 'prompt'; workspaceId: string; promptId: string; runId?: string };

export function parseHash(hash: string): RouteView {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [, section, workspaceId, page, promptId] = path.split('/');
  if (section === 'w' && workspaceId) {
    if (page === 'settings') {
      return { page: 'settings', workspaceId };
    }
    if (page === 'posts') {
      return promptId
        ? { page: 'post', workspaceId, postId: promptId }
        : { page: 'posts', workspaceId };
    }
    if (page === 'gaps') {
      return { page: 'gaps', workspaceId };
    }
    if (page === 'g' && promptId) {
      return { page: 'gap', workspaceId, gapId: promptId };
    }
    if (page === 'p' && promptId) {
      const runId = new URLSearchParams(query).get('run') ?? undefined;
      return { page: 'prompt', workspaceId, promptId, runId };
    }
    return { page: 'workspace', workspaceId };
  }
  return { page: 'home' };
}

export const href = {
  home: () => '#/',
  workspace: (workspaceId: string) => `#/w/${workspaceId}`,
  settings: (workspaceId: string) => `#/w/${workspaceId}/settings`,
  gaps: (workspaceId: string) => `#/w/${workspaceId}/gaps`,
  gap: (workspaceId: string, gapId: string) => `#/w/${workspaceId}/g/${gapId}`,
  posts: (workspaceId: string) => `#/w/${workspaceId}/posts`,
  post: (workspaceId: string, postId: string) => `#/w/${workspaceId}/posts/${postId}`,
  prompt: (workspaceId: string, promptId: string, runId?: string) =>
    `#/w/${workspaceId}/p/${promptId}${runId ? `?run=${encodeURIComponent(runId)}` : ''}`,
};

export function useHashRoute(): RouteView {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
