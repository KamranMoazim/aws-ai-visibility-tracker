import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { loadOutputs } from '../scripts/outputs.js';
import { DEMO_PROMPTS, DEMO_SETTINGS } from '../scripts/demo-data.js';
import { check, deletePartitions, finish, mcpAccessToken, mcpCall, toolResult } from './helpers.js';

const outputs = loadOutputs();
const { newId } = await import('../src/core/ids.js');
const { workspacePk } = await import('../src/core/keys.js');
const { putGap } = await import('../src/data/gaps.js');
const { putPrompt, putWorkspace } = await import('../src/data/workspaces.js');
const { TABLE_NAME } = await import('../src/core/table.js');
const cognito = new CognitoIdentityProviderClient({ region: outputs.Region });
const TOOL = (name: string) => `answershare___${name}`;

async function createUser() {
  const email = `mcp-test-${randomBytes(4).toString('hex')}@example.com`;
  const password = `Pw-${randomBytes(12).toString('hex')}`;
  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: outputs.UserPoolId,
      Username: email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: outputs.UserPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );
  const sub = created.User!.Attributes!.find((attribute) => attribute.Name === 'sub')!.Value!;
  return { email, password, sub };
}

const owner = await createUser();
const stranger = await createUser();
const workspaceId = `test-${newId()}`;
const createdAt = new Date().toISOString();

try {
  await putWorkspace({
    ...DEMO_SETTINGS,
    workspaceId,
    ownerId: owner.sub,
    createdAt,
    engines: ['fake'],
    samples: 1,
    schedule: 'off',
    digest: false,
  });
  const promptId = newId();
  await putPrompt(workspaceId, { ...DEMO_PROMPTS[0], promptId, createdAt });
  await putGap({
    gapId: promptId,
    workspaceId,
    promptId,
    promptText: DEMO_PROMPTS[0].text,
    stage: DEMO_PROMPTS[0].stage,
    status: 'open',
    score: 2,
    missingEngines: ['nova'],
    missingRate: 1,
    neverCited: false,
    brief: {
      sourcesCover: ['Fee tables'],
      missingPoints: ['A fee comparison'],
      action: 'new',
      pageType: 'comparison guide',
      title: 'International invoicing fees compared',
      outline: [{ heading: 'Fees', points: ['FX margin'] }],
      questions: ['What does it cost?'],
      facts: ['Our FX margin: [fill in]'],
      phrases: ['lowest fees'],
    },
    createdAt,
    updatedAt: createdAt,
  });

  const unauthenticated = await mcpCall(undefined, 'tools/list');
  check(
    'gateway refuses calls without a token',
    unauthenticated.status === 401,
    unauthenticated.status,
  );

  const readToken = await mcpAccessToken(owner.email, owner.password, ['answershare/read']);
  const listed = await mcpCall(readToken, 'tools/list');
  const names: string[] = (listed.body?.result?.tools ?? []).map(
    (tool: { name: string }) => tool.name,
  );
  check(
    'read token sees the four read tools and not draft_from_gap',
    names.length === 4 &&
      !names.includes(TOOL('draft_from_gap')) &&
      names.includes(TOOL('get_visibility')),
    names,
  );
  const workspaces = toolResult(
    await mcpCall(readToken, 'tools/call', { name: TOOL('list_workspaces'), arguments: {} }),
  );
  check(
    'list_workspaces returns the owner workspace',
    workspaces.workspaces?.[0]?.workspace_id === workspaceId,
    workspaces,
  );
  const visibility = toolResult(
    await mcpCall(readToken, 'tools/call', {
      name: TOOL('get_visibility'),
      arguments: { workspace_id: workspaceId },
    }),
  );
  check(
    'get_visibility answers with the api note',
    visibility.brand === 'Acme Pay' && visibility.note?.includes('API answers'),
    visibility,
  );
  const gaps = toolResult(
    await mcpCall(readToken, 'tools/call', {
      name: TOOL('list_gaps'),
      arguments: { workspace_id: workspaceId },
    }),
  );
  check('list_gaps ranks the gap', gaps.gaps?.[0]?.gap_id === promptId, gaps);
  const gap = toolResult(
    await mcpCall(readToken, 'tools/call', {
      name: TOOL('get_gap'),
      arguments: { workspace_id: workspaceId, gap_id: promptId },
    }),
  );
  check(
    'get_gap returns the brief and marks third-party data',
    gap.brief?.title && gap.note?.includes('not instructions'),
    gap,
  );
  const deniedDraft = await mcpCall(readToken, 'tools/call', {
    name: TOOL('draft_from_gap'),
    arguments: { workspace_id: workspaceId, gap_id: promptId },
  });
  check(
    'read token cannot draft',
    Boolean(deniedDraft.body?.error) || deniedDraft.body?.result?.isError === true,
    deniedDraft.body,
  );

  const strangerToken = await mcpAccessToken(stranger.email, stranger.password, [
    'answershare/read',
  ]);
  const strangerView = toolResult(
    await mcpCall(strangerToken, 'tools/call', {
      name: TOOL('get_visibility'),
      arguments: { workspace_id: workspaceId },
    }),
  );
  check(
    'another user cannot read the workspace',
    strangerView.error?.code === 'not_found',
    strangerView,
  );
  const spoofed = toolResult(
    await mcpCall(strangerToken, 'tools/call', {
      name: TOOL('get_visibility'),
      arguments: {
        workspace_id: workspaceId,
        _caller: { sub: owner.sub, client_id: 'x', scope: 'answershare/read' },
      },
    }),
  );
  check(
    'a spoofed _caller is overwritten by the gateway',
    spoofed.error?.code === 'not_found',
    spoofed,
  );

  const draftToken = await mcpAccessToken(owner.email, owner.password, [
    'answershare/read',
    'answershare/draft',
  ]);
  const drafted = toolResult(
    await mcpCall(draftToken, 'tools/call', {
      name: TOOL('draft_from_gap'),
      arguments: { workspace_id: workspaceId, gap_id: promptId },
    }),
  );
  check(
    'draft token starts a draft and is told publishing is human-only',
    Boolean(drafted.post_id) &&
      drafted.status === 'generating' &&
      drafted.note?.includes('by a person'),
    drafted,
  );
} finally {
  await deletePartitions(outputs.Region, TABLE_NAME, [workspacePk(workspaceId)]);
  for (const user of [owner, stranger]) {
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: outputs.UserPoolId, Username: user.email }),
    );
  }
}
finish();
