import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { parseArgs } from 'node:util';
import { loadOutputs } from './outputs.js';

const outputs = loadOutputs();
const { getRun, listRuns } = await import('../src/data/runs.js');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'max-calls': { type: 'string' }, 'no-wait': { type: 'boolean', default: false } },
});
const workspaceId = positionals[0];
if (!workspaceId) {
  console.error('usage: npm run run:start -- <workspaceId> [--max-calls 30] [--no-wait]');
  process.exit(1);
}

const sfn = new SFNClient({ region: outputs.Region });
const { executionArn } = await sfn.send(
  new StartExecutionCommand({
    stateMachineArn: outputs.StateMachineArn,
    input: JSON.stringify({
      workspaceId,
      trigger: 'manual',
      ...(values['max-calls'] ? { maxCalls: Number(values['max-calls']) } : {}),
    }),
  }),
);
console.log(`execution=${executionArn}`);
if (values['no-wait']) {
  process.exit(0);
}

let status = 'RUNNING';
while (status === 'RUNNING') {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  status = (await sfn.send(new DescribeExecutionCommand({ executionArn }))).status ?? 'UNKNOWN';
}
const [latest] = await listRuns(workspaceId, 1);
const run = latest ? await getRun(workspaceId, latest.runId) : undefined;
console.log(`execution status=${status}`);
console.log(
  JSON.stringify(
    run && {
      runId: run.runId,
      status: run.status,
      refusedReason: run.refusedReason,
      plannedCalls: run.plannedCalls,
      extracted: run.extracted,
      failed: run.failed,
      rates: run.rates,
      cost: run.cost,
      gapCandidates: run.gapCandidates?.length,
      newBrands: run.newBrands,
      diff: run.diff,
    },
    null,
    2,
  ),
);
process.exit(status === 'SUCCEEDED' ? 0 : 1);
