import { apiCall } from './client';
import type {
  Answer,
  Brand,
  Competitor,
  CrawlerCheck,
  Gap,
  GapStatus,
  GapSummary,
  PagesView,
  Post,
  PostStatus,
  Prompt,
  Run,
  Stage,
  TrendPoint,
  UntrackedBrand,
  Visibility,
  Workspace,
  WorkspaceSettings,
  WorkspaceView,
} from './types';

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

export const api = {
  workspaces: () =>
    apiCall<{ workspaces: { workspaceId: string; name: string; brand: Brand }[] }>(
      'GET',
      '/workspaces',
    ),
  createWorkspace: (settings: WorkspaceSettings & { competitors: Competitor[] }) =>
    apiCall<{ workspace: Workspace }>('POST', '/workspaces', settings),
  workspace: (workspaceId: string) => apiCall<WorkspaceView>('GET', ws(workspaceId)),
  saveSettings: (workspaceId: string, settings: WorkspaceSettings) =>
    apiCall<{ workspace: Workspace }>('PUT', ws(workspaceId), settings),
  saveCompetitors: (workspaceId: string, competitors: Competitor[]) =>
    apiCall<{ competitors: Competitor[] }>('PUT', `${ws(workspaceId)}/competitors`, {
      competitors: competitors.map(({ slug, ...competitor }) => competitor),
    }),
  addPrompt: (workspaceId: string, prompt: Pick<Prompt, 'text' | 'stage' | 'active'>) =>
    apiCall<{ prompt: Prompt }>('POST', `${ws(workspaceId)}/prompts`, prompt),
  updatePrompt: (workspaceId: string, prompt: Prompt) =>
    apiCall<{ prompt: Prompt }>('PUT', `${ws(workspaceId)}/prompts/${prompt.promptId}`, {
      text: prompt.text,
      stage: prompt.stage,
      active: prompt.active,
    }),
  deletePrompt: (workspaceId: string, promptId: string) =>
    apiCall<{ deleted: boolean }>('DELETE', `${ws(workspaceId)}/prompts/${promptId}`),
  suggestPrompts: (workspaceId: string) =>
    apiCall<{ suggestions: { text: string; stage: Stage }[] }>(
      'POST',
      `${ws(workspaceId)}/prompts/suggest`,
    ),
  startRun: (workspaceId: string) =>
    apiCall<{ started: boolean }>('POST', `${ws(workspaceId)}/runs`),
  runs: (workspaceId: string) => apiCall<{ runs: Run[] }>('GET', `${ws(workspaceId)}/runs`),
  visibility: (workspaceId: string) =>
    apiCall<Visibility>('GET', `${ws(workspaceId)}/visibility?engine=*`),
  answers: (workspaceId: string, promptId: string, runId?: string) =>
    apiCall<{ prompt: Prompt; runId: string | null; answers: Answer[] }>(
      'GET',
      `${ws(workspaceId)}/prompts/${promptId}/answers${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`,
    ),
  gaps: (workspaceId: string, status: GapStatus = 'open') =>
    apiCall<{ gaps: GapSummary[] }>('GET', `${ws(workspaceId)}/gaps?status=${status}`),
  gap: (workspaceId: string, gapId: string) =>
    apiCall<{ gap: Gap }>('GET', `${ws(workspaceId)}/gaps/${gapId}`),
  setGapStatus: (workspaceId: string, gapId: string, action: 'dismiss' | 'reopen') =>
    apiCall<{ status: GapStatus }>('POST', `${ws(workspaceId)}/gaps/${gapId}/${action}`),
  findGap: (workspaceId: string, promptId: string) =>
    apiCall<{ queued: boolean }>('POST', `${ws(workspaceId)}/prompts/${promptId}/gap`),
  importSitemap: (workspaceId: string) =>
    apiCall<{ queued: boolean }>('POST', `${ws(workspaceId)}/sitemap/import`),
  pages: (workspaceId: string) => apiCall<PagesView>('GET', `${ws(workspaceId)}/pages`),
  draftFromGap: (workspaceId: string, gapId: string) =>
    apiCall<{ postId: string }>('POST', `${ws(workspaceId)}/gaps/${gapId}/draft`),
  posts: (workspaceId: string, status: PostStatus) =>
    apiCall<{ posts: (Omit<Post, 'markdown' | 'faq'> & { placeholders: number })[] }>(
      'GET',
      `${ws(workspaceId)}/posts?status=${status}`,
    ),
  post: (workspaceId: string, postId: string) =>
    apiCall<{ post: Post; placeholders: string[] }>('GET', `${ws(workspaceId)}/posts/${postId}`),
  savePost: (
    workspaceId: string,
    post: Pick<Post, 'postId' | 'title' | 'slug' | 'description' | 'markdown' | 'faq'>,
  ) =>
    apiCall<{ post: Post; placeholders: string[] }>(
      'PUT',
      `${ws(workspaceId)}/posts/${post.postId}`,
      {
        title: post.title,
        slug: post.slug,
        description: post.description,
        markdown: post.markdown,
        faq: post.faq,
      },
    ),
  publishPost: (workspaceId: string, postId: string, target: 'hosted' | 'wordpress') =>
    apiCall<{ url: string }>('POST', `${ws(workspaceId)}/posts/${postId}/publish`, { target }),
  unpublishPost: (workspaceId: string, postId: string) =>
    apiCall<{ unpublished: boolean }>('POST', `${ws(workspaceId)}/posts/${postId}/unpublish`),
  crawlerCheck: (workspaceId: string, target: 'hosted' | 'wordpress' | 'site') =>
    apiCall<CrawlerCheck>('GET', `${ws(workspaceId)}/crawler-check?target=${target}`),
  promptTrend: (workspaceId: string, promptId: string) =>
    apiCall<{
      points: TrendPoint[];
      links: { postId: string; title: string; publishedAt: string; url?: string }[];
    }>('GET', `${ws(workspaceId)}/prompts/${promptId}/trend`),
  brands: (workspaceId: string) =>
    apiCall<{ brands: UntrackedBrand[] }>('GET', `${ws(workspaceId)}/brands`),
};

export { ApiError } from './client';
export * from './types';
