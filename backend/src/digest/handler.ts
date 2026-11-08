import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { getRun, previousCompletedRun } from '../data/runs.js';
import { getWorkspace, listPrompts } from '../data/workspaces.js';
import { buildDigest } from './build.js';

const ENGINE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  nova: 'Nova',
  sonar: 'Sonar',
  fake: 'Fake',
};
const SKIPPED_TRIGGERS = new Set(['test']);

const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});

export interface ExecutionEvent {
  detail: { status: string; output?: string };
}

async function ownerEmail(ownerId: string): Promise<string | undefined> {
  if (!/^[0-9a-f-]{36}$/.test(ownerId)) {
    return undefined;
  }
  const { Users = [] } = await cognito.send(
    new ListUsersCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Filter: `sub = "${ownerId}"`,
      Limit: 1,
    }),
  );
  return Users[0]?.Attributes?.find((attribute) => attribute.Name === 'email')?.Value;
}

export async function handler(event: ExecutionEvent): Promise<void> {
  if (event.detail.status !== 'SUCCEEDED' || !event.detail.output) {
    return;
  }
  const { runId, workspaceId } = JSON.parse(event.detail.output) as {
    runId?: string;
    workspaceId?: string;
  };
  if (!runId || !workspaceId) {
    return;
  }
  const [workspace, run] = await Promise.all([
    getWorkspace(workspaceId),
    getRun(workspaceId, runId),
  ]);
  if (!workspace || !run || SKIPPED_TRIGGERS.has(run.trigger) || workspace.digest === false) {
    console.log(`digest skipped run=${runId} trigger=${run?.trigger} digest=${workspace?.digest}`);
    return;
  }
  const [prompts, previous] = await Promise.all([
    listPrompts(workspaceId),
    run.status === 'complete'
      ? previousCompletedRun(workspaceId, runId)
      : Promise.resolve(undefined),
  ]);
  let mentioned = 0;
  let answers = 0;
  for (const engines of Object.values(run.summary ?? {})) {
    for (const [hits, total] of Object.values(engines)) {
      mentioned += hits;
      answers += total;
    }
  }
  const texts = new Map(prompts.map((prompt) => [prompt.promptId, prompt.text]));
  const digest = buildDigest({
    workspaceName: workspace.name,
    brandName: workspace.brand.name,
    dashboardUrl: `${process.env.SITE_URL}/#/w/${workspaceId}`,
    run,
    previous: previous ? await getRun(workspaceId, previous.runId) : undefined,
    totals: answers ? { mentioned, answers } : undefined,
    promptText: (promptId) => texts.get(promptId) ?? 'A removed prompt',
    engineLabel: (engine) => ENGINE_LABELS[engine] ?? engine,
  });
  const recipient = (await ownerEmail(workspace.ownerId)) ?? process.env.ALERT_EMAIL!;
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.DIGEST_FROM!,
      Destination: { ToAddresses: [recipient] },
      Content: {
        Simple: {
          Subject: { Data: digest.subject },
          Body: { Text: { Data: digest.text }, Html: { Data: digest.html } },
        },
      },
    }),
  );
  console.log(`digest sent run=${runId} status=${run.status}`);
}
