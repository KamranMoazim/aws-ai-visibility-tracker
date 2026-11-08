import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { GapJob } from '../core/queue.js';
import { RAW_BUCKET_NAME } from '../core/storage.js';
import { putGap, getGap } from '../data/gaps.js';
import { setSitemapImport } from '../data/pages.js';
import { getPrompt, getWorkspace } from '../data/workspaces.js';
import { findGap } from '../gaps/find.js';
import { importSitemap } from '../gaps/import-sitemap.js';

const MAX_RECEIVES = 3;

async function runJob(job: GapJob): Promise<void> {
  const workspace = await getWorkspace(job.workspaceId);
  if (!workspace) {
    console.log(`job skipped workspace=${job.workspaceId} reason=deleted`);
    return;
  }
  if (job.type === 'sitemap') {
    const count = await importSitemap(workspace);
    console.log(`sitemap ok workspace=${workspace.workspaceId} pages=${count}`);
    return;
  }
  const prompt = await getPrompt(workspace.workspaceId, job.promptId);
  if (!prompt) {
    console.log(`job skipped prompt=${job.promptId} reason=deleted`);
    return;
  }
  await findGap(workspace, prompt, job.runId, RAW_BUCKET_NAME);
}

async function recordFinalFailure(job: GapJob, message: string): Promise<void> {
  if (job.type === 'sitemap') {
    await setSitemapImport(job.workspaceId, {
      status: 'failed',
      at: new Date().toISOString(),
      error: message,
    });
    return;
  }
  const existing = await getGap(job.workspaceId, job.promptId);
  if (existing) {
    await putGap({
      ...existing,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    let job: GapJob | undefined;
    try {
      job = JSON.parse(record.body) as GapJob;
      await runJob(job);
    } catch (error) {
      const message = `${(error as Error).name}: ${(error as Error).message}`.slice(0, 500);
      console.error(`gap job failed message=${record.messageId} ${message}`);
      if (job && Number(record.attributes.ApproximateReceiveCount) >= MAX_RECEIVES) {
        await recordFinalFailure(job, message).catch(() => undefined);
      }
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
