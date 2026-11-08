import { useState } from 'react';
import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { EmptyState, ErrorText, Loading } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { api, type GapStatus } from '../lib/api';
import { engineLabel, percent, shortDate } from '../lib/format';
import { useLoad } from '../lib/hooks/useLoad';

const TABS: { value: GapStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'failed', label: 'Could not finish' },
];

export function GapsList() {
  const { workspaceId, workspace } = useWorkspace();
  const [status, setStatus] = useState<GapStatus>('open');
  const gaps = useLoad(() => api.gaps(workspaceId, status), [workspaceId, status]);

  return (
    <div className="gaps">
      <PageHeader
        title="Gaps"
        description={`Questions where answers leave ${workspace.brand.name} out, or never cite your site. Comparison questions and those missing on several engines rank highest.`}
      />
      <Tabs label="Gap status" value={status} options={TABS} onChange={setStatus} />
      <ErrorText message={gaps.error} />
      {gaps.loading && !gaps.data && <Loading />}
      {gaps.data && !gaps.data.gaps.length && (
        <EmptyState title={status === 'open' ? 'No open gaps' : 'Nothing here'}>
          {status === 'open'
            ? 'Gaps appear after a run in which you are missing from a prompt.'
            : null}
        </EmptyState>
      )}
      <ol className="gap-list">
        {gaps.data?.gaps.map((gap) => (
          <li key={gap.gapId}>
            <a href={href.gap(workspaceId, gap.gapId)}>
              <span className="gap-score" aria-label={`Score ${gap.score.toFixed(1)}`}>
                {gap.score.toFixed(1)}
              </span>
              <span className="gap-body">
                <span className="gap-question">{gap.promptText}</span>
                <span className="gap-why">
                  {gap.missingEngines.length
                    ? `Missing on ${gap.missingEngines.map(engineLabel).join(', ')}, ${percent(gap.missingRate)} of answers`
                    : 'Named, but your site is never cited'}
                </span>
                {gap.title && (
                  <span className="gap-plan">
                    {gap.action === 'improve' ? 'Improve a page' : `New ${gap.pageType}`}:{' '}
                    {gap.title}
                  </span>
                )}
                {gap.error && <span className="gap-why">{gap.error}</span>}
              </span>
              <span className="gap-date">{shortDate(gap.updatedAt)}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
