import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { loadOutputs } from '../scripts/outputs.js';
import { DEMO_COMPETITORS, DEMO_PROMPTS, DEMO_SETTINGS } from '../scripts/demo-data.js';
import { check, deletePartitions, finish } from './helpers.js';

const outputs = loadOutputs();
const { runPk, workspacePk } = await import('../src/core/keys.js');
const { deleteSchedule } = await import('../src/core/schedules.js');
const { TABLE_NAME } = await import('../src/core/table.js');
const cognito = new CognitoIdentityProviderClient({ region: outputs.Region });

async function createUser(): Promise<{ email: string; token: string }> {
  const email = `api-test-${randomBytes(4).toString('hex')}@example.com`;
  const password = `Pw-${randomBytes(12).toString('hex')}`;
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: outputs.UserPoolId,
      Username: email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'email', Value: email }],
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
  const auth = await cognito.send(
    new InitiateAuthCommand({
      ClientId: outputs.UserPoolClientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  );
  return { email, token: auth.AuthenticationResult!.IdToken! };
}

async function call(token: string | undefined, method: string, path: string, body?: unknown) {
  const response = await fetch(outputs.ApiUrl + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
}

const owner = await createUser();
const stranger = await createUser();
const workspaceIds: string[] = [];
const runIds: string[] = [];

try {
  check('health is public', (await call(undefined, 'GET', '/health')).status === 200);
  check('no token is 401', (await call(undefined, 'GET', '/workspaces')).status === 401);
  check('bad token is 401', (await call('not.a.jwt', 'GET', '/workspaces')).status === 401);

  const created = await call(owner.token, 'POST', '/workspaces', {
    ...DEMO_SETTINGS,
    engines: ['fake'],
    samples: 2,
    schedule: 'weekly',
    competitors: DEMO_COMPETITORS,
  });
  const workspaceId = created.body.workspace?.workspaceId as string;
  workspaceIds.push(workspaceId);
  check(
    'workspace created with competitors',
    created.status === 201 && created.body.competitors?.length === 5,
    created,
  );

  const ownBrandAsCompetitor = await call(
    owner.token,
    'PUT',
    `/workspaces/${workspaceId}/competitors`,
    {
      competitors: [{ name: 'Acme Pay', aliases: [] }],
    },
  );
  check(
    'own brand cannot be a competitor',
    ownBrandAsCompetitor.status === 400,
    ownBrandAsCompetitor.body,
  );

  const branded = await call(owner.token, 'POST', `/workspaces/${workspaceId}/prompts`, {
    text: "What are AcmePay's fees for agencies?",
    stage: 'comparison',
  });
  check(
    'prompt naming the brand is rejected',
    branded.status === 400 && branded.body.error === 'brand_in_prompt',
    branded.body,
  );
  const invalid = await call(owner.token, 'POST', `/workspaces/${workspaceId}/prompts`, {
    text: 'hi',
    stage: 'x',
  });
  check('invalid prompt is 400', invalid.status === 400, invalid.body);

  for (const prompt of DEMO_PROMPTS.slice(0, 3)) {
    const added = await call(owner.token, 'POST', `/workspaces/${workspaceId}/prompts`, prompt);
    check(`prompt added: ${prompt.text.slice(0, 30)}`, added.status === 201, added.body);
  }
  const duplicate = await call(
    owner.token,
    'POST',
    `/workspaces/${workspaceId}/prompts`,
    DEMO_PROMPTS[0],
  );
  check('duplicate prompt is 409', duplicate.status === 409, duplicate.body);

  const view = await call(owner.token, 'GET', `/workspaces/${workspaceId}`);
  check('owner reads workspace', view.status === 200 && view.body.prompts.length === 3, view.body);
  const list = await call(owner.token, 'GET', '/workspaces');
  check(
    'workspace listed for owner',
    list.body.workspaces?.some((item: any) => item.workspaceId === workspaceId),
  );

  check(
    'stranger gets 404 on workspace',
    (await call(stranger.token, 'GET', `/workspaces/${workspaceId}`)).status === 404,
  );
  check(
    'stranger cannot start a run',
    (await call(stranger.token, 'POST', `/workspaces/${workspaceId}/runs`)).status === 404,
  );
  check(
    'stranger cannot read answers',
    (
      await call(
        stranger.token,
        'GET',
        `/workspaces/${workspaceId}/prompts/${view.body.prompts[0].promptId}/answers`,
      )
    ).status === 404,
  );
  check(
    'stranger does not see the workspace in their list',
    (await call(stranger.token, 'GET', '/workspaces')).body.workspaces.length === 0,
  );

  const started = await call(owner.token, 'POST', `/workspaces/${workspaceId}/runs`);
  check('run now accepted', started.status === 202, started.body);
  const again = await call(owner.token, 'POST', `/workspaces/${workspaceId}/runs`);
  check('second manual run within the hour is 429', again.status === 429, again.body);

  let run: any;
  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const runs = await call(owner.token, 'GET', `/workspaces/${workspaceId}/runs`);
    run = runs.body.runs?.[0];
    if (run && run.status !== 'running') {
      break;
    }
  }
  if (run) {
    runIds.push(run.runId);
  }
  check('run completes', run?.status === 'complete' && run.extracted === 6, run);
  const detail = await call(owner.token, 'GET', `/workspaces/${workspaceId}/runs/${run?.runId}`);
  check(
    'run detail hides execution arn',
    detail.status === 200 && !('executionArn' in detail.body.run),
    detail.body,
  );

  const visibility = await call(
    owner.token,
    'GET',
    `/workspaces/${workspaceId}/visibility?engine=*`,
  );
  const all = visibility.body.points?.find((point: any) => point.engine === 'all');
  check(
    'visibility returns the workspace rollup with sample sizes',
    visibility.status === 200 &&
      all?.answers === 6 &&
      all?.mentionRate === 0 &&
      visibility.body.latestRun?.runId === run?.runId,
    visibility.body,
  );
  check(
    'cited domains in the rollup',
    Object.keys(all?.citedDomains ?? {}).length > 0,
    all?.citedDomains,
  );

  const promptId = view.body.prompts[0].promptId;
  const answers = await call(
    owner.token,
    'GET',
    `/workspaces/${workspaceId}/prompts/${promptId}/answers`,
  );
  check(
    'who comes up returns the latest answers with brands and citations',
    answers.status === 200 &&
      answers.body.answers.length === 2 &&
      answers.body.answers.every(
        (answer: any) => answer.mentions?.length > 0 && answer.citations?.length > 0,
      ),
    answers.body,
  );
  check(
    'answers do not leak internal keys',
    answers.body.answers.every((answer: any) => !('PK' in answer)),
  );
  const byRun = await call(
    owner.token,
    'GET',
    `/workspaces/${workspaceId}/prompts/${promptId}/answers?runId=${run?.runId}`,
  );
  check('answers for a chosen run', byRun.body.answers?.length === 2, byRun.body);

  const brands = await call(owner.token, 'GET', `/workspaces/${workspaceId}/brands`);
  check(
    'untracked brands endpoint',
    brands.status === 200 && Array.isArray(brands.body.brands),
    brands.body,
  );

  const paused = await call(owner.token, 'PUT', `/workspaces/${workspaceId}/prompts/${promptId}`, {
    text: view.body.prompts[0].text,
    stage: view.body.prompts[0].stage,
    active: false,
  });
  check(
    'prompt can be paused',
    paused.status === 200 && paused.body.prompt.active === false,
    paused.body,
  );
  const settings = await call(owner.token, 'PUT', `/workspaces/${workspaceId}`, {
    ...DEMO_SETTINGS,
    engines: ['fake'],
    samples: 1,
    schedule: 'off',
  });
  check(
    'settings saved and schedule turned off',
    settings.status === 200 && settings.body.workspace.samples === 1,
    settings.body,
  );
  const removed = await call(
    owner.token,
    'DELETE',
    `/workspaces/${workspaceId}/prompts/${promptId}`,
  );
  check('prompt deleted', removed.status === 200);
} finally {
  for (const workspaceId of workspaceIds.filter(Boolean)) {
    await deleteSchedule(workspaceId);
  }
  await deletePartitions(outputs.Region, TABLE_NAME, [
    ...workspaceIds.filter(Boolean).map(workspacePk),
    ...runIds.map(runPk),
  ]);
  for (const user of [owner, stranger]) {
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: outputs.UserPoolId, Username: user.email }),
    );
  }
}
finish();
