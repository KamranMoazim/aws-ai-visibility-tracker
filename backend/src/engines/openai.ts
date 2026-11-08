import { postJson } from './http.js';
import { dedupeCitations, type AnswerEngine, type Citation, type EngineAnswer } from './types.js';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

interface OpenAiResponse {
  model?: string;
  output?: {
    type: string;
    content?: {
      type: string;
      text?: string;
      annotations?: { type: string; url?: string; title?: string }[];
    }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function parseOpenAiResponse(raw: unknown): EngineAnswer {
  const response = raw as OpenAiResponse;
  const output = response.output ?? [];
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of output) {
    if (item.type !== 'message') {
      continue;
    }
    for (const part of item.content ?? []) {
      if (part.type !== 'output_text') {
        continue;
      }
      texts.push(part.text ?? '');
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url) {
          citations.push({ url: annotation.url, title: annotation.title });
        }
      }
    }
  }
  return {
    text: texts.join('\n').trim(),
    citations: dedupeCitations(citations),
    model: response.model ?? 'unknown',
    searchCalls: output.filter((item) => item.type === 'web_search_call').length,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    raw,
  };
}

export function openAiEngine(apiKey: string, model: string): AnswerEngine {
  return {
    id: 'openai',
    async ask(prompt, options) {
      const tool = options.country
        ? { type: 'web_search', user_location: { type: 'approximate', country: options.country } }
        : { type: 'web_search' };
      const raw = await postJson('openai', RESPONSES_URL, apiKey, {
        model,
        input: prompt,
        tools: [tool],
      });
      return parseOpenAiResponse(raw);
    },
  };
}
