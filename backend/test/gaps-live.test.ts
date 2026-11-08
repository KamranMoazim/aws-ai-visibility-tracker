import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { loadOutputs } from '../scripts/outputs.js';
import { DEMO_COMPETITORS, DEMO_PROMPTS, DEMO_SETTINGS } from '../scripts/demo-data.js';
import { check, deletePartitions, finish } from './helpers.js';

const outputs = loadOutputs();
const { newId, slugify } = await import('../src/core/ids.js');
const { runPk, workspacePk } = await import('../src/core/keys.js');
const { FILL_IN } = await import('../src/gaps/brief.js');
const { listGaps } = await import('../src/data/gaps.js');
const { listRuns } = await import('../src/data/runs.js');
const { putPrompt, putWorkspace, replaceCompetitors } = await import('../src/data/workspaces.js');
const { TABLE_NAME } = await import('../src/core/table.js');
const sfn = new SFNClient({ region: outputs.Region });

const workspaceId = `test-${newId()}`;
const createdAt = new Date().toISOString();
await putWorkspace({
  ...DEMO_SETTINGS,
  workspaceId,
  ownerId: 'gaps-test',
  createdAt,
  engines: ['fake'],
  samples: 2,
  schedule: 'off',
});
await replaceCompetitors(
  workspaceId,
  DEMO_COMPETITORS.map((competitor) => ({ ...competitor, slug: slugify(competitor.name) })),
);
for (const prompt of DEMO_PROMPTS.slice(0, 2)) {
  await putPrompt(workspaceId, { ...prompt, promptId: newId(), createdAt });
}
const runIds: string[] = [];

try {
  const { executionArn } = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: outputs.StateMachineArn,
      input: JSON.stringify({ workspaceId, trigger: 'test' }),
    }),
  );
  let status = 'RUNNING';
  while (status === 'RUNNING') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = (await sfn.send(new DescribeExecutionCommand({ executionArn }))).status ?? '';
  }
  const [run] = await listRuns(workspaceId, 1);
  runIds.push(run.runId);
  check(
    'run queued a gap job per missing prompt',
    run.status === 'complete' && run.gapJobsQueued === 2,
    run,
  );

  let gaps = await listGaps(workspaceId, 'open');
  for (let attempt = 0; attempt < 60 && gaps.length < 2; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    gaps = await listGaps(workspaceId, 'open');
  }
  check(
    'worker wrote two open gaps',
    gaps.length === 2,
    gaps.map((gap) => gap.status),
  );
  const [top] = gaps;
  check(
    'gaps sorted by score with missing engines',
    gaps.length === 2 && gaps[0].score >= gaps[1].score && top.missingEngines.join() === 'fake',
    gaps.map((gap) => gap.score),
  );
  check(
    'evidence lists competitors and cited sources',
    (top?.evidence?.competitors.length ?? 0) > 0 && (top?.evidence?.sources.length ?? 0) > 0,
    top?.evidence,
  );
  check(
    'cited pages were attempted with the guarded fetcher',
    (top?.sourcesRead?.length ?? 0) > 0,
    top?.sourcesRead,
  );
  check(
    'brief has an outline and a title',
    (top?.brief?.outline.length ?? 0) > 0 && Boolean(top?.brief?.title),
    top?.brief,
  );
  check(
    'product facts are placeholders only',
    (top?.brief?.facts ?? []).every((fact) => fact.includes(FILL_IN)),
    top?.brief?.facts,
  );
  check('no own pages imported means a new page', top?.brief?.action === 'new', top?.brief?.action);
} finally {
  await deletePartitions(outputs.Region, TABLE_NAME, [
    workspacePk(workspaceId),
    ...runIds.map(runPk),
  ]);
}
finish();
