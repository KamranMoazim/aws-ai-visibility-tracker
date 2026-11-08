import { getIdToken } from './auth';
import { loadConfig } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiUrl } = await loadConfig();
  const token = await getIdToken();
  const response = await fetch(apiUrl + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? 'error',
      payload.message ?? response.statusText,
    );
  }
  return payload as T;
}

export const ENGINES = ['openai', 'nova', 'sonar', 'fake'] as const;
export type EngineId = (typeof ENGINES)[number];
export const STAGES = ['problem', 'solution', 'comparison'] as const;
export type Stage = (typeof STAGES)[number];

export interface Brand {
  name: string;
  domain: string;
  aliases: string[];
}

export interface Competitor {
  name: string;
  domain?: string;
  aliases: string[];
  slug?: string;
}

export interface WorkspaceSettings {
  name: string;
  brand: Brand;
  country?: string;
  engines: EngineId[];
  samples: number;
  schedule: 'weekly' | 'off';
}

export interface Workspace extends WorkspaceSettings {
  workspaceId: string;
  ownerId: string;
  createdAt: string;
  lastManualRunAt?: string;
  sitemapImport?: PagesView['import'];
}

export interface Prompt {
  promptId: string;
  text: string;
  stage: Stage;
  active: boolean;
  createdAt: string;
}

export interface Rates {
  mentionRate: number | null;
  firstMentionRate: number | null;
  averagePosition: number | null;
  shareOfVoice: number | null;
  recommendedRate: number | null;
  citationRate: number | null;
}

export interface TrendPoint extends Rates {
  runId: string;
  engine: string;
  at: string;
  answers: number;
  failed: number;
  mentioned: number;
  firstMentions: number;
  recommended: number;
  cited: number;
  trackedMentions: number;
  brandMentions: Record<string, number>;
  citedDomains: Record<string, number>;
}

export type RunSummary = Record<string, Record<string, [number, number]>>;

export interface GapCandidate {
  promptId: string;
  missingEngines: string[];
  missingRate: number;
  neverCited: boolean;
}

export interface Run {
  runId: string;
  status: 'running' | 'complete' | 'failed' | 'refused';
  trigger: string;
  startedAt: string;
  finishedAt?: string;
  engines: EngineId[];
  skippedEngines: EngineId[];
  samples: number;
  promptCount: number;
  plannedCalls: number;
  answered: number;
  extracted: number;
  failed: number;
  refusedReason?: string;
  cost?: {
    total: number;
    extraction: number;
    engines: Record<string, { dollars: number; searchCalls: number }>;
  };
  rates?: Rates;
  newBrands?: string[];
  gapCandidates?: GapCandidate[];
  disagreements?: number;
}

export interface Visibility {
  from: string;
  to: string;
  points: TrendPoint[];
  latestRun: {
    runId: string;
    startedAt: string;
    rates?: Rates;
    summary?: RunSummary;
    diff?: {
      lost: { promptId: string; engine: string }[];
      gained: { promptId: string; engine: string }[];
    };
    newBrands?: string[];
    gapCandidates?: GapCandidate[];
    disagreements?: number;
    cost?: Run['cost'];
  } | null;
}

export interface Mention {
  key: string;
  name: string;
  brandId?: string;
  position: number;
  recommended: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  source: 'both' | 'matcher' | 'llm';
}

export interface Answer {
  runId: string;
  promptId: string;
  engine: EngineId;
  sample: number;
  askedAt: string;
  status: 'answered' | 'extracted' | 'failed';
  model?: string;
  text?: string;
  citations?: { url: string; title?: string }[];
  mentions?: Mention[];
  disagreement?: { onlyMatcher: string[]; onlyLlm: string[] };
  extractError?: string;
  error?: string;
}

export interface UntrackedBrand {
  slug: string;
  name: string;
  mentions: number;
  promptIds: string[];
  firstSeen: string;
  lastSeen: string;
}

export type GapStatus = 'open' | 'dismissed' | 'drafted' | 'failed' | 'pending';

export interface GapBrief {
  sourcesCover: string[];
  missingPoints: string[];
  action: 'improve' | 'new';
  improveUrl?: string;
  pageType: string;
  title: string;
  outline: { heading: string; points: string[] }[];
  questions: string[];
  facts: string[];
  phrases: string[];
}

export interface GapSummary {
  gapId: string;
  promptId: string;
  promptText: string;
  stage: Stage;
  status: GapStatus;
  score: number;
  missingEngines: string[];
  missingRate: number;
  neverCited: boolean;
  title?: string;
  pageType?: string;
  action?: 'improve' | 'new';
  error?: string;
  updatedAt: string;
}

export interface Gap extends GapSummary {
  runId?: string;
  evidence?: {
    answers: number;
    competitors: { name: string; count: number }[];
    others: { name: string; count: number }[];
    sources: { url: string; title?: string; count: number }[];
  };
  sourcesRead?: { url: string; title?: string; ok: boolean; error?: string }[];
  ownPages?: { url: string; title?: string }[];
  brief?: GapBrief;
}

export interface PagesView {
  import: { status: string; pages?: number; at: string; error?: string } | null;
  count: number;
  pages: { url: string; title?: string }[];
}

export interface WorkspaceView {
  workspace: Workspace;
  competitors: Competitor[];
  prompts: Prompt[];
}

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
  brands: (workspaceId: string) =>
    apiCall<{ brands: UntrackedBrand[] }>('GET', `${ws(workspaceId)}/brands`),
};
