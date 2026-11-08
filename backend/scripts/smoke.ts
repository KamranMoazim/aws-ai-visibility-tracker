import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { parseArgs } from 'node:util';
import { loadOutputs } from './outputs.js';
import { DEMO_COMPETITORS, DEMO_PROMPTS, DEMO_SETTINGS } from './demo-data.js';

const outputs = loadOutputs();
const { newId, slugify } = await import('../src/core/ids.js');
const { runPk, workspacePk } = await import('../src/core/keys.js');
const { getRun, listRuns } = await import('../src/data/runs.js');
const { putPrompt, putWorkspace, replaceCompetitors } = await import('../src/data/workspaces.js');
const { deletePartitions } = await import('../test/helpers.js');
const { TABLE_NAME } = await import('../src/core/table.js');

const { values } = parseArgs({
  options: {
    engines: { type: 'string', default: 'openai,nova,sonar' },
    keep: { type: 'boolean', default: false },
  },
});
const engines = values.engines.split(',').map((engine) => engine.trim()) as (
  | 'openai'
  | 'nova'
  | 'sonar'
)[];
const keep = values.keep;
const PROMPTS = 5;
const workspaceId = `smoke-${newId()}`;
const createdAt = new Date().toISOString();
await putWorkspace({
  ...DEMO_SETTINGS,
  name: 'Smoke run',
  workspaceId,
  ownerId: 'smoke',
  createdAt,
  engines,
  samples: 1,
  schedule: 'off',
  digest: false,
});
await replaceCompetitors(
  workspaceId,
  DEMO_COMPETITORS.map((competitor) => ({ ...competitor, slug: slugify(competitor.name) })),
);
for (const prompt of DEMO_PROMPTS.slice(0, PROMPTS)) {
  await putPrompt(workspaceId, { ...prompt, promptId: newId(), createdAt });
}

const sfn = new SFNClient({ region: outputs.Region });
const { executionArn } = await sfn.send(
  new StartExecutionCommand({
    stateMachineArn: outputs.StateMachineArn,
    input: JSON.stringify({ workspaceId, trigger: 'test', maxCalls: PROMPTS * engines.length }),
  }),
);
console.log(
  `smoke run started (${PROMPTS} prompts x ${engines.join(',')} x 1 sample) execution=${executionArn}`,
);
let status = 'RUNNING';
while (status === 'RUNNING') {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  status = (await sfn.send(new DescribeExecutionCommand({ executionArn }))).status ?? 'UNKNOWN';
}
const [latest] = await listRuns(workspaceId, 1);
const run = latest ? await getRun(workspaceId, latest.runId) : undefined;
console.log(
  JSON.stringify(
    {
      execution: status,
      status: run?.status,
      engines: run?.engines,
      skippedEngines: run?.skippedEngines,
      extracted: run?.extracted,
      failed: run?.failed,
      disagreements: run?.disagreements,
      rates: run?.rates,
      cost: run?.cost,
    },
    null,
    2,
  ),
);
if (!keep) {
  await deletePartitions(outputs.Region, TABLE_NAME, [
    workspacePk(workspaceId),
    ...(run ? [runPk(run.runId)] : []),
  ]);
}
process.exit(
  status === 'SUCCEEDED' && run?.status === 'complete' && run.skippedEngines.length === 0 ? 0 : 1,
);
