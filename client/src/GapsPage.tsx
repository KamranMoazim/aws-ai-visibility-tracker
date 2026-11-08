import { useState } from 'react';
import { api, type GapStatus } from './api';
import { engineLabel, percent, shortDate } from './format';
import { href } from './route';
import { useLoad } from './useLoad';

const TABS: { status: GapStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'drafted', label: 'Drafted' },
  { status: 'dismissed', label: 'Dismissed' },
  { status: 'failed', label: 'Could not finish' },
];

export function GapsPage({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = useState<GapStatus>('open');
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  const gaps = useLoad(() => api.gaps(workspaceId, status), [workspaceId, status]);

  return (
    <div className="gaps-page">
      <a className="back" href={href.workspace(workspaceId)}>
        Back to {view.data?.workspace.name ?? 'workspace'}
      </a>
      <h1>Gaps</h1>
      <p className="muted lede">
        Prompts where answers leave {view.data?.workspace.brand.name ?? 'you'} out, or never cite
        your site. Highest score first: comparison prompts and prompts missing on several engines
        rank higher.
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
      {gaps.error && <p className="error">{gaps.error}</p>}
      {gaps.data && !gaps.data.gaps.length && (
        <p className="empty">
          {status === 'open'
            ? 'No open gaps. They appear after a run where you are missing from a prompt.'
            : 'Nothing here.'}
        </p>
      )}
      <ol className="gap-list">
        {gaps.data?.gaps.map((gap) => (
          <li key={gap.gapId}>
            <a href={href.gap(workspaceId, gap.gapId)}>
              <span className="gap-score" title="Gap score">
                {gap.score.toFixed(1)}
              </span>
              <span className="gap-body">
                <strong>{gap.promptText}</strong>
                <span className="muted small">
                  {gap.missingEngines.length
                    ? `Missing on ${gap.missingEngines.map(engineLabel).join(', ')} (${percent(gap.missingRate)} of answers)`
                    : 'Named, but your site is never cited'}
                  {gap.title
                    ? `. Suggested ${gap.action === 'improve' ? 'update' : gap.pageType}: ${gap.title}`
                    : ''}
                  {gap.error ? `. ${gap.error}` : ''}
                </span>
              </span>
              <span className="muted small">{shortDate(gap.updatedAt)}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
