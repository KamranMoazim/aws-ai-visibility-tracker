import { useState } from 'react';
import { api, type PostStatus } from './api';
import { dateTime } from './format';
import { href } from './route';
import { useLoad } from './useLoad';

const TABS: { status: PostStatus; label: string }[] = [
  { status: 'draft', label: 'Drafts' },
  { status: 'published', label: 'Published' },
  { status: 'generating', label: 'Being written' },
  { status: 'failed', label: 'Could not finish' },
];

export function PostsPage({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = useState<PostStatus>('draft');
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  const posts = useLoad(() => api.posts(workspaceId, status), [workspaceId, status]);

  return (
    <div>
      <a className="back" href={href.workspace(workspaceId)}>
        Back to {view.data?.workspace.name ?? 'workspace'}
      </a>
      <h1>Pages</h1>
      <p className="muted lede">
        Drafts start from a gap brief. Nothing is published until you press Publish.
      </p>
      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            role="tab"
            aria-selected={status === tab.status}
            className={status === tab.status ? 'tab active' : 'tab'}
            onClick={() => setStatus(tab.status)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {posts.error && <p className="error">{posts.error}</p>}
      {posts.data && !posts.data.posts.length && (
        <p className="empty">
          {status === 'draft' ? (
            <>
              No drafts. Open a <a href={href.gaps(workspaceId)}>gap</a> and choose Draft a page.
            </>
          ) : (
            'Nothing here.'
          )}
        </p>
      )}
      <ul className="workspace-list">
        {posts.data?.posts.map((post) => (
          <li key={post.postId}>
            <a href={href.post(workspaceId, post.postId)}>
              <strong>{post.title}</strong>
              <span>
                {post.status === 'published' && post.publishedUrl
                  ? post.publishedUrl
                  : post.placeholders
                    ? `${post.placeholders} to fill in`
                    : `Edited ${dateTime(post.updatedAt)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
