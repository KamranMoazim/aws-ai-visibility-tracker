import type { Context } from 'aws-lambda';
import { handler } from '../src/mcp-tools/handler.js';
import { runTool, TOOL_SCOPES, ToolError } from '../src/mcp-tools/tools.js';
import { check, finish, fixture } from './helpers.js';

const context = (tool: string) =>
  ({
    clientContext: { custom: { bedrockAgentCoreToolName: `answershare___${tool}` } },
  }) as unknown as Context;

const anonymous = (await handler({ workspace_id: 'w1' }, context('get_visibility'))) as any;
check(
  'tool call without caller is refused',
  anonymous.error?.code === 'unauthenticated',
  anonymous,
);

const readOnly = { sub: 'u1', client_id: 'c1', scope: 'answershare/read' };
const denied = (await handler(
  { _caller: readOnly, workspace_id: 'w1', gap_id: 'g1' },
  context('draft_from_gap'),
)) as any;
check(
  'draft needs the draft scope even if the gateway let it through',
  denied.error?.code === 'forbidden',
  denied,
);
const unknown = (await handler({ _caller: readOnly }, context('publish_post'))) as any;
check('there is no publish tool', unknown.error?.code === 'unknown_tool', unknown);
const badId = (await handler(
  { _caller: readOnly, workspace_id: '../etc' },
  context('get_visibility'),
)) as any;
check(
  'malformed workspace ids are not found, not errors',
  badId.error?.code === 'not_found',
  badId,
);

let threw: unknown;
try {
  await runTool(
    'get_gap',
    { workspace_id: 'w1', gap_id: 'bad id!' },
    { userId: 'u1', clientId: 'c1', scopes: ['answershare/read'] },
  );
} catch (error) {
  threw = error;
}
check(
  'argument validation reports the field',
  threw instanceof ToolError &&
    /not_found|gap_id/.test(`${(threw as ToolError).code} ${(threw as ToolError).message}`),
  threw,
);

const schema = fixture('../../src/mcp-tools/tool-schema.json') as { name: string }[];
check(
  'schema and scope map list the same five tools',
  schema
    .map((tool) => tool.name)
    .sort()
    .join() === Object.keys(TOOL_SCOPES).sort().join() && schema.length === 5,
);
finish();
