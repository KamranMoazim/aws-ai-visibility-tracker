import type { Context } from 'aws-lambda';
import { runTool, ToolError, type Caller } from './tools.js';

const TOOL_DELIMITER = '___';

interface GatewayCaller {
  sub?: string;
  client_id?: string;
  scope?: string;
}

function toolNameFrom(context: Context): string {
  const custom =
    (context.clientContext as unknown as {
      custom?: Record<string, string>;
      Custom?: Record<string, string>;
    }) ?? {};
  const qualified = (custom.custom ?? custom.Custom)?.bedrockAgentCoreToolName ?? '';
  return qualified.slice(qualified.indexOf(TOOL_DELIMITER) + TOOL_DELIMITER.length);
}

export async function handler(event: Record<string, unknown>, context: Context) {
  const { _caller: rawCaller, ...args } = event ?? {};
  const gatewayCaller = (rawCaller ?? {}) as GatewayCaller;
  const toolName = toolNameFrom(context);
  if (!gatewayCaller.sub || !gatewayCaller.client_id) {
    console.error(`tool ${toolName} called without caller identity`);
    return { error: { code: 'unauthenticated', message: 'Caller identity missing' } };
  }
  const caller: Caller = {
    userId: gatewayCaller.sub,
    clientId: gatewayCaller.client_id,
    scopes: (gatewayCaller.scope ?? '').split(' ').filter(Boolean),
  };
  try {
    return await runTool(toolName, args, caller);
  } catch (error) {
    if (!(error instanceof ToolError)) {
      console.error(
        `tool ${toolName} failed: ${(error as Error).name} ${(error as Error).message}`,
      );
    }
    const toolError =
      error instanceof ToolError ? error : new ToolError('internal', 'The tool failed');
    return { error: { code: toolError.code, message: toolError.message } };
  }
}
