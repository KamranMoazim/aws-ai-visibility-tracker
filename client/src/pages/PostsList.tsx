import { useState } from 'react';
import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { EmptyState, ErrorText, Loading } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { api, type PostStatus } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad } from '../lib/hooks/useLoad';

const TABS: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'generating', label: 'Being written' },
  { value: 'failed', label: 'Could not finish' },
];

export function PostsList() {
  const { workspaceId } = useWorkspace();
  const [status, setStatus] = useState<PostStatus>('draft');
  const posts = useLoad(() => api.posts(workspaceId, status), [workspaceId, status]);

  return (
    <div className="posts">
      <PageHeader
        title="Pages"
        description="Drafts start from a gap brief. Nothing is published until you press Publish."
      />
      <Tabs label="Page status" value={status} options={TABS} onChange={setStatus} />
      <ErrorText message={posts.error} />
      {posts.loading && !posts.data && <Loading />}
      {posts.data && !posts.data.posts.length && (
        <EmptyState title={status === 'draft' ? 'No drafts' : 'Nothing here'}>
          {status === 'draft' && (
            <>
              Open a <a href={href.gaps(workspaceId)}>gap</a> and choose Draft a page.
            </>
          )}
        </EmptyState>
      )}
      <ul className="post-list">
        {posts.data?.posts.map((post) => (
          <li key={post.postId}>
            <a href={href.post(workspaceId, post.postId)}>
              <span className="post-title">{post.title}</span>
              <span className="post-meta">
                {post.status === 'published' && post.publishedUrl
                  ? post.publishedUrl
                  : post.placeholders
                    ? `${post.placeholders} ${post.placeholders === 1 ? 'fact' : 'facts'} to fill in`
                    : `Edited ${dateTime(post.updatedAt)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
