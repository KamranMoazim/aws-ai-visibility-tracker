import { useEffect, useState } from 'react';

export type RouteView =
  | { page: 'home' }
  | { page: 'workspace'; workspaceId: string }
  | { page: 'settings'; workspaceId: string }
  | { page: 'prompt'; workspaceId: string; promptId: string; runId?: string };

export function parseHash(hash: string): RouteView {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [, section, workspaceId, page, promptId] = path.split('/');
  if (section === 'w' && workspaceId) {
    if (page === 'settings') {
      return { page: 'settings', workspaceId };
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
