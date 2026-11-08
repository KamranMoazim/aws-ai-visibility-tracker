import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { EmptyState, ErrorText, Loading, Notice } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { WithPlaceholders } from '../components/Placeholders';
import { Panel } from '../components/Panel';
import { api } from '../lib/api';
import { dateTime, engineLabel, hostOf, percent } from '../lib/format';
import { useAction } from '../lib/hooks/useAction';
import { useLoad } from '../lib/hooks/useLoad';

export function GapDetail({ gapId }: { gapId: string }) {
  const { workspaceId } = useWorkspace();
  const gap = useLoad(() => api.gap(workspaceId, gapId), [workspaceId, gapId]);
  const status = useAction();
  const refresh = useAction();
  const draft = useAction();

  if (gap.error) {
    return <ErrorText message={gap.error} />;
  }
  if (!gap.data) {
    return <Loading />;
  }
  const item = gap.data.gap;
  const brief = item.brief;

  return (
    <div className="gap-detail">
      <PageHeader
        serif
        back={{ href: href.gaps(workspaceId), label: 'All gaps' }}
        title={item.promptText}
        description={
          <>
            {item.missingEngines.length
              ? `Missing from ${percent(item.missingRate)} of answers, on ${item.missingEngines.map(engineLabel).join(', ')}.`
              : 'Answers name you, but none cite your site.'}{' '}
            Score {item.score.toFixed(2)}, updated {dateTime(item.updatedAt)}.
          </>
        }
        actions={
          <>
            {brief && (
              <button
                className="button button-primary"
                disabled={draft.busy}
                onClick={() =>
                  draft.run(async () => {
                    const { postId } = await api.draftFromGap(workspaceId, gapId);
                    window.location.hash = href.post(workspaceId, postId);
                  })
                }
              >
                Draft a page
              </button>
            )}
            <button
              className="button"
              disabled={refresh.busy || refresh.ran}
              onClick={() =>
                refresh.run(async () => {
                  await api.findGap(workspaceId, item.promptId);
                })
              }
            >
              Refresh brief
            </button>
            {item.status === 'dismissed' ? (
              <button
                className="button button-quiet"
                disabled={status.busy}
                onClick={() =>
                  status.run(async () => {
                    await api.setGapStatus(workspaceId, gapId, 'reopen');
                    gap.reload();
                  })
                }
              >
                Reopen
              </button>
            ) : (
              <button
                className="button button-quiet"
                disabled={status.busy || item.status === 'drafted'}
                onClick={() =>
                  status.run(async () => {
                    await api.setGapStatus(workspaceId, gapId, 'dismiss');
                    gap.reload();
                  })
                }
              >
                Dismiss
              </button>
            )}
          </>
        }
      />
      <ErrorText message={refresh.error ?? draft.error ?? status.error} />
      {refresh.ran && !refresh.error && (
        <Notice tone="ok">Queued. The new brief appears here in a minute or two.</Notice>
      )}
      {item.error && <Notice tone="warn">{item.error}</Notice>}

      <div className="detail-grid">
        <div className="detail-main">
          {brief ? (
            <>
              <section className="brief">
                <p className="brief-kind">
                  {brief.action === 'improve'
                    ? 'Improve an existing page'
                    : `Write a new ${brief.pageType}`}
                </p>
                <h2 className="brief-title">{brief.title}</h2>
                {brief.improveUrl && (
                  <p>
                    <a href={brief.improveUrl} target="_blank" rel="noopener noreferrer">
                      {brief.improveUrl}
                    </a>
                  </p>
                )}
                <ol className="outline">
                  {brief.outline.map((section) => (
                    <li key={section.heading}>
                      <span className="outline-heading">{section.heading}</span>
                      {section.points.length > 0 && (
                        <ul>
                          {section.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
              <Panel title="What the cited sources cover that you do not">
                <ul className="plain-list">
                  {brief.missingPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                {brief.sourcesCover.length > 0 && (
                  <>
                    <h3>What those sources cover</h3>
                    <ul className="plain-list muted">
                      {brief.sourcesCover.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
              {brief.questions.length > 0 && (
                <Panel title="Questions to answer word for word">
                  <ul className="plain-list quoted">
                    {brief.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </Panel>
              )}
              {brief.facts.length > 0 && (
                <Panel
                  title="Facts only you can supply"
                  aside={
                    <span className="muted small">
                      Drafts cannot be published until each is filled in.
                    </span>
                  }
                >
                  <ul className="facts">
                    {brief.facts.map((fact) => (
                      <li key={fact}>
                        <WithPlaceholders text={fact} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          ) : (
            <EmptyState title="No brief yet">Refresh it once this prompt has answers.</EmptyState>
          )}
        </div>
        <aside className="detail-rail">
          {item.evidence && item.evidence.competitors.length > 0 && (
            <Panel title="Named instead of you">
              <ol className="ranked">
                {item.evidence.competitors.map((competitor) => (
                  <li key={competitor.name}>
                    <span className="ranked-name">{competitor.name}</span>
                    <span className="ranked-value">
                      {competitor.count}/{item.evidence!.answers}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {item.sourcesRead && item.sourcesRead.length > 0 && (
            <Panel title="Sources compared">
              <ul className="sources">
                {item.sourcesRead.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                      {source.title || hostOf(source.url)}
                    </a>
                    <span className="source-host">
                      {source.ok ? hostOf(source.url) : 'could not read'}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Your closest pages">
            {item.ownPages?.length ? (
              <ul className="sources">
                {item.ownPages.map((page) => (
                  <li key={page.url}>
                    <a href={page.url} target="_blank" rel="noopener noreferrer">
                      {page.title || page.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                None found. <a href={href.settings(workspaceId)}>Import your sitemap</a> so briefs
                can compare your pages.
              </p>
            )}
          </Panel>
          {brief && brief.phrases.length > 0 && (
            <Panel title="Phrases the answers use">
              <p className="phrases">
                {brief.phrases.map((phrase) => (
                  <span key={phrase} className="chip">
                    {phrase}
                  </span>
                ))}
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
