import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';

export type GapJob =
  | { type: 'gap'; workspaceId: string; promptId: string; runId?: string }
  | { type: 'sitemap'; workspaceId: string }
  | { type: 'draft'; workspaceId: string; gapId: string; postId: string };

const sqs = new SQSClient({});
const BATCH = 10;

export async function sendJobs(queueUrl: string, jobs: GapJob[]): Promise<void> {
  for (let start = 0; start < jobs.length; start += BATCH) {
    const batch = jobs.slice(start, start + BATCH);
    const response = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: batch.map((job, index) => ({
          Id: String(index),
          MessageBody: JSON.stringify(job),
        })),
      }),
    );
    if (response.Failed?.length) {
      throw new Error(
        `queueing failed for ${response.Failed.length} jobs: ${response.Failed[0].Message}`,
      );
    }
  }
}
