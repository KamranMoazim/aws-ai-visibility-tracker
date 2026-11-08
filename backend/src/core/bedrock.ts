import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { NOVA_MODEL_ID } from '../engines/nova.js';

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1', maxAttempts: 5 });

export interface ToolCallRequest {
  system: string;
  user: string;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  modelId?: string;
  maxTokens?: number;
}

export interface ToolCallResult {
  input: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export function toolInputOf(raw: unknown, toolName: string): unknown {
  const content =
    (
      raw as {
        output?: { message?: { content?: { toolUse?: { name?: string; input?: unknown } }[] } };
      }
    ).output?.message?.content ?? [];
  const toolUse = content.find((block) => block.toolUse?.name === toolName)?.toolUse;
  if (!toolUse) {
    throw new Error(`model returned no ${toolName} call`);
  }
  return toolUse.input;
}

export async function callTool(request: ToolCallRequest): Promise<ToolCallResult> {
  const modelId = request.modelId ?? NOVA_MODEL_ID;
  const response = await bedrock.send(
    new ConverseCommand({
      modelId,
      system: [{ text: request.system }],
      messages: [{ role: 'user', content: [{ text: request.user }] }],
      inferenceConfig: { temperature: 0, maxTokens: request.maxTokens ?? 2000 },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: request.toolName,
              description: request.description,
              inputSchema: { json: request.schema as never },
            },
          },
        ],
        toolChoice: { tool: { name: request.toolName } },
      },
    }),
  );
  return {
    input: toolInputOf(response, request.toolName),
    model: modelId,
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    },
  };
}
