import { newId, slugify } from '../core/ids.js';
import { sendJobs } from '../core/queue.js';
import { getGap, setGapStatus } from '../data/gaps.js';
import { putPost, type Post } from '../data/posts.js';

export class NoBrief extends Error {
  constructor() {
    super('This gap has no brief to draft from');
    this.name = 'NoBrief';
  }
}

export async function startDraftFromGap(
  workspaceId: string,
  gapId: string,
  queueUrl: string,
): Promise<Post> {
  const gap = await getGap(workspaceId, gapId);
  if (!gap?.brief) {
    throw new NoBrief();
  }
  const now = new Date().toISOString();
  const post: Post = {
    postId: newId(),
    workspaceId,
    gapId,
    promptIds: [gap.promptId],
    status: 'generating',
    title: gap.brief.title,
    slug: slugify(gap.brief.title),
    description: '',
    markdown: '',
    faq: [],
    createdAt: now,
    updatedAt: now,
  };
  await putPost(post);
  await sendJobs(queueUrl, [{ type: 'draft', workspaceId, gapId, postId: post.postId }]);
  await setGapStatus(workspaceId, gapId, ['open', 'failed'], 'drafted');
  return post;
}
