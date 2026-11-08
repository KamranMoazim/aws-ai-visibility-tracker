export const META_SK = 'META';
export const COMPETITOR_PREFIX = 'COMP#';
export const PROMPT_PREFIX = 'PROMPT#';
export const RUN_PREFIX = 'RUN#';
export const ANSWER_PREFIX = 'ANS#';
export const METRIC_PREFIX = 'MET#';
export const BRAND_PREFIX = 'BRAND#';
export const PAGE_PREFIX = 'PAGE#';
export const GAP_PREFIX = 'GAP#';
export const POST_PREFIX = 'POST#';
export const LINK_PREFIX = 'LINK#';

export const workspacePk = (workspaceId: string) => `WS#${workspaceId}`;
export const userPk = (userId: string) => `USER#${userId}`;
export const workspaceSk = (workspaceId: string) => `WS#${workspaceId}`;
export const competitorSk = (slug: string) => `${COMPETITOR_PREFIX}${slug}`;
export const promptSk = (promptId: string) => `${PROMPT_PREFIX}${promptId}`;
export const runSk = (runId: string) => `${RUN_PREFIX}${runId}`;
export const runPk = (runId: string) => `${RUN_PREFIX}${runId}`;
export const answerSk = (promptId: string, engine: string, sample: number) =>
  `${ANSWER_PREFIX}${promptId}#${engine}#${sample}`;
export const promptIndexPk = (promptId: string) => `${PROMPT_PREFIX}${promptId}`;
export const answerIndexSk = (iso: string, engine: string, sample: number) =>
  `${iso}#${engine}#${sample}`;
export const ALL_PROMPTS = '_all';
export const ALL_ENGINES = 'all';
export const metricSk = (promptId: string, engine: string, iso: string) =>
  `${METRIC_PREFIX}${promptId}#${engine}#${iso}`;
export const metricPrefix = (promptId: string, engine: string) =>
  `${METRIC_PREFIX}${promptId}#${engine}#`;
export const workspaceMetricsPk = (workspaceId: string) => `WS#${workspaceId}#MET`;
export const workspaceMetricsSk = (iso: string, engine: string) => `${iso}#${engine}`;
export const brandSk = (slug: string) => `${BRAND_PREFIX}${slug}`;
export const pageSk = (urlHash: string) => `${PAGE_PREFIX}${urlHash}`;
export const gapSk = (gapId: string) => `${GAP_PREFIX}${gapId}`;
export const gapIndexPk = (workspaceId: string, status: string) =>
  `WS#${workspaceId}#GAP#${status}`;
export const scoreSk = (score: number) => score.toFixed(4).padStart(12, '0');
export const postSk = (postId: string) => `${POST_PREFIX}${postId}`;
export const postIndexPk = (workspaceId: string, status: string) =>
  `WS#${workspaceId}#POST#${status}`;
export const linkSk = (promptId: string, postId: string) => `${LINK_PREFIX}${promptId}#${postId}`;
export const linkPrefix = (promptId: string) => `${LINK_PREFIX}${promptId}#`;
