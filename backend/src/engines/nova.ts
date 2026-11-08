import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { isRetryableStatus } from './http.js';
import {
  dedupeCitations,
  EngineError,
  type AnswerEngine,
  type Citation,
  type EngineAnswer,
} from './types.js';

export const NOVA_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';
export const NOVA_GROUNDING_TOOL = 'nova_grounding';

interface WebCitation {
  title?: string;
  location?: { web?: { url?: string; domain?: string } };
}

interface NovaBlock {
  text?: string;
  toolUse?: { name?: string };
  citationsContent?: { content?: { text?: string }[]; citations?: WebCitation[] } | WebCitation[];
}

interface NovaResponse {
  output?: { message?: { content?: NovaBlock[] } };
  usage?: { inputTokens?: number; outputTokens?: number };
}

const RETRYABLE_NAMES = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'InternalServerException',
  'ModelNotReadyException',
  'ModelTimeoutException',
]);

function citationOf(citation: WebCitation): Citation {
  return { url: citation.location?.web?.url ?? '', title: citation.title };
}

export function parseNovaResponse(raw: unknown): EngineAnswer {
  const response = raw as NovaResponse;
  const texts: string[] = [];
  const citations: Citation[] = [];
  const blocks = response.output?.message?.content ?? [];
  for (const block of blocks) {
    if (block.text) {
      texts.push(block.text);
    }
    const cited = block.citationsContent;
    if (Array.isArray(cited)) {
      citations.push(...cited.map(citationOf));
    } else if (cited) {
      for (const part of cited.content ?? []) {
        if (part.text) {
          texts.push(part.text);
        }
      }
      citations.push(...(cited.citations ?? []).map(citationOf));
    }
  }
  return {
    text: texts.join('').trim(),
    citations: dedupeCitations(citations),
    model: NOVA_MODEL_ID,
    searchCalls: blocks.filter((block) => block.toolUse?.name === NOVA_GROUNDING_TOOL).length,
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    },
    raw,
  };
}

export function novaEngine(
  client = new BedrockRuntimeClient({ region: 'us-east-1' }),
): AnswerEngine {
  return {
    id: 'nova',
    async ask(prompt) {
      try {
        const response = await client.send(
          new ConverseCommand({
            modelId: NOVA_MODEL_ID,
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            toolConfig: { tools: [{ systemTool: { name: NOVA_GROUNDING_TOOL } }] },
          }),
        );
        const { $metadata, ...body } = response;
        return parseNovaResponse(body);
      } catch (error) {
        const failure = error as Error & { $metadata?: { httpStatusCode?: number } };
        const status = failure.$metadata?.httpStatusCode;
        throw new EngineError(
          'nova',
          status,
          RETRYABLE_NAMES.has(failure.name) || (status !== undefined && isRetryableStatus(status)),
          `${failure.name}: ${failure.message}`,
        );
      }
    },
  };
}
