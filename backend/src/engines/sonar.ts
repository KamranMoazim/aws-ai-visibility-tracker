import { postJson } from './http.js';
import { dedupeCitations, type AnswerEngine, type Citation, type EngineAnswer } from './types.js';

const CHAT_URL = 'https://api.perplexity.ai/chat/completions';
export const SONAR_MODEL = 'sonar';

interface SonarResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { url?: string; title?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function parseSonarResponse(raw: unknown): EngineAnswer {
  const response = raw as SonarResponse;
  const citations: Citation[] = response.search_results?.length
    ? response.search_results.map((result) => ({ url: result.url ?? '', title: result.title }))
    : (response.citations ?? []).map((url) => ({ url }));
  return {
    text: (response.choices?.[0]?.message?.content ?? '').trim(),
    citations: dedupeCitations(citations),
    model: response.model ?? SONAR_MODEL,
    searchCalls: 1,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
    raw,
  };
}

export function sonarEngine(apiKey: string): AnswerEngine {
  return {
    id: 'sonar',
    async ask(prompt, options) {
      const raw = await postJson('sonar', CHAT_URL, apiKey, {
        model: SONAR_MODEL,
        messages: [{ role: 'user', content: prompt }],
        ...(options.country
          ? { web_search_options: { user_location: { country: options.country } } }
          : {}),
      });
      return parseSonarResponse(raw);
    },
  };
}
