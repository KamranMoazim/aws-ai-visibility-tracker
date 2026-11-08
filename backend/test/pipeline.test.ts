import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { loadOutputs } from '../scripts/outputs.js';
import { DEMO_COMPETITORS, DEMO_PROMPTS, DEMO_SETTINGS } from '../scripts/demo-data.js';
import { check, deletePartitions, finish } from './helpers.js';

const outputs = loadOutputs();
const { hashId, newId, slugify } = await import('../src/core/ids.js');
const { ALL_ENGINES, ALL_PROMPTS, metricPrefix, runPk, workspacePk } = await import(
  '../src/core/keys.js'
);
const { FAKE_FAIL_MARKER } = await import('../src/engines/fake.js');
const { listRunAnswers } = await import('../src/data/answers.js');
const { queryAll } = await import('../src/data/query.js');
const { getRun, listRuns } = await import('../src/data/runs.js');
const { putPrompt, putWorkspace, replaceCompetitors } = await import('../src/data/workspaces.js');
const { TABLE_NAME } = await import('../src/core/table.js');

const sfn = new SFNClient({ region: outputs.Region });
const lambda = new LambdaClient({ region: outputs.Region });

async function runAndWait(workspaceId: string, maxCalls?: number): Promise<string> {
  const { executionArn } = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: outputs.StateMachineArn,
      input: JSON.stringify({ workspaceId, trigger: 'test', ...(maxCalls ? { maxCalls } : {}) }),
    }),
  );
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { status } = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    if (status !== 'RUNNING') {
      return status ?? 'UNKNOWN';
    }
  }
}

const workspaceId = `test-${newId()}`;
const createdAt = new Date().toISOString();
await putWorkspace({
  ...DEMO_SETTINGS,
  workspaceId,
  ownerId: 'pipeline-test',
  createdAt,
  engines: ['fake'],
  samples: 3,
  schedule: 'off',
});
await replaceCompetitors(
  workspaceId,
  DEMO_COMPETITORS.map((competitor) => ({ ...competitor, slug: slugify(competitor.name) })),
);
const prompts = [
  ...DEMO_PROMPTS.slice(0, 9),
  { text: `Forced failure prompt ${FAKE_FAIL_MARKER}`, stage: 'problem' as const, active: true },
];
for (const prompt of prompts) {
  await putPrompt(workspaceId, { ...prompt, promptId: hashId(prompt.text), createdAt });
}
const runIds: string[] = [];

try {
  const status = await runAndWait(workspaceId);
  check('10-prompt fake run succeeds', status === 'SUCCEEDED', status);
  const [latest] = await listRuns(workspaceId, 1);
  runIds.push(latest.runId);
  const run = (await getRun(workspaceId, latest.runId))!;
  check(
    'run complete with 27 extracted and 3 failed',
    run.status === 'complete' &&
      run.plannedCalls === 30 &&
      run.extracted === 27 &&
      run.failed === 3,
    run,
  );
  check(
    'mention rate and share of voice computed',
    run.rates?.mentionRate === 0 && typeof run.rates?.shareOfVoice === 'number',
    run.rates,
  );
  check('fake run costs nothing', run.cost?.total === 0, run.cost);
  check('every prompt is a gap candidate', run.gapCandidates?.length === 9, run.gapCandidates);
  check('matcher-only run finds no untracked brands', run.newBrands?.length === 0, run.newBrands);

  const answers = await listRunAnswers(run.runId);
  check('30 answer items, one per slot', answers.length === 30, answers.length);
  check(
    'failed slots stored as failed, not lost',
    answers.filter((answer) => answer.status === 'failed').length === 3,
  );

  const replay = answers.find((answer) => answer.status === 'extracted')!;
  const prompt = prompts.find((candidate) => hashId(candidate.text) === replay.promptId)!;
  const invoke = await lambda.send(
    new InvokeCommand({
      FunctionName: outputs.AskFunctionName,
      Payload: Buffer.from(
        JSON.stringify({
          runId: run.runId,
          workspaceId,
          startedAt: run.startedAt,
          promptId: replay.promptId,
          prompt: prompt.text,
          engine: 'fake',
          sample: replay.sample,
        }),
      ),
    }),
  );
  check('replayed ask succeeds', !invoke.FunctionError, invoke.FunctionError);
  const afterReplay = await listRunAnswers(run.runId);
  const runAfterReplay = (await getRun(workspaceId, run.runId))!;
  check(
    'replaying an item creates no duplicate',
    afterReplay.length === 30 && runAfterReplay.answered === run.answered,
    { items: afterReplay.length, answered: runAfterReplay.answered },
  );

  const rollups = await queryAll<Record<string, unknown>>({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': workspacePk(workspaceId),
      ':prefix': metricPrefix(ALL_PROMPTS, ALL_ENGINES),
    },
  });
  check(
    'workspace rollup written with sample size',
    rollups.length === 1 && rollups[0].answers === 27 && rollups[0].failed === 3,
    rollups,
  );

  const cappedStatus = await runAndWait(workspaceId, 5);
  const [capped] = await listRuns(workspaceId, 1);
  runIds.push(capped.runId);
  check(
    'run over the cap is refused before asking',
    cappedStatus === 'SUCCEEDED' &&
      capped.status === 'refused' &&
      capped.refusedReason?.includes('cap') === true &&
      (await listRunAnswers(capped.runId)).length === 0,
    capped,
  );
} finally {
  await deletePartitions(outputs.Region, TABLE_NAME, [
    workspacePk(workspaceId),
    ...runIds.map((runId) => runPk(runId)),
  ]);
}
finish();
