export const ENGINE_IDS = ['openai', 'nova', 'sonar', 'fake'] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export interface Citation {
  url: string;
  title?: string;
}

export interface EngineAnswer {
  text: string;
  citations: Citation[];
  model: string;
  searchCalls: number;
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown;
}

export interface AskOptions {
  country?: string;
  sample?: number;
}

export interface AnswerEngine {
  id: EngineId;
  ask(prompt: string, options: AskOptions): Promise<EngineAnswer>;
}

export const RETRYABLE_ERROR = 'EngineRetryableError';
export const FATAL_ERROR = 'EngineFatalError';

export class EngineError extends Error {
  constructor(
    public engine: EngineId,
    public status: number | undefined,
    public retryable: boolean,
    message: string,
  ) {
    super(`${engine}: ${message}`);
    this.name = retryable ? RETRYABLE_ERROR : FATAL_ERROR;
  }
}

export function cleanUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return undefined;
  }
  for (const name of [...parsed.searchParams.keys()]) {
    if (name.toLowerCase().startsWith('utm_')) {
      parsed.searchParams.delete(name);
    }
  }
  parsed.hash = '';
  return parsed.toString();
}

export function dedupeCitations(citations: Citation[]): Citation[] {
  const byUrl = new Map<string, Citation>();
  for (const citation of citations) {
    const url = cleanUrl(citation.url);
    if (!url) {
      continue;
    }
    const existing = byUrl.get(url);
    if (!existing || (!existing.title && citation.title)) {
      byUrl.set(url, { url, title: citation.title });
    }
  }
  return [...byUrl.values()];
}
