import { api } from './api';
import { dateTime, engineLabel, hostOf, percent } from './format';
import { href } from './route';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

export function GapPage({ workspaceId, gapId }: { workspaceId: string; gapId: string }) {
  const gap = useLoad(() => api.gap(workspaceId, gapId), [workspaceId, gapId]);
  const action = useAction();
  const refresh = useAction();

  if (gap.error) {
    return <p className="error">{gap.error}</p>;
  }
  if (!gap.data) {
    return <p className="muted">Loading</p>;
  }
  const item = gap.data.gap;
  const brief = item.brief;

  return (
    <div className="gap-page">
      <a className="back" href={href.gaps(workspaceId)}>
        All gaps
      </a>
      <h1 className="prompt-title">{item.promptText}</h1>
      <p className="muted">
        {item.missingEngines.length
          ? `You are missing from ${percent(item.missingRate)} of answers, on ${item.missingEngines.map(engineLabel).join(', ')}.`
          : 'Answers name you, but none cite your site.'}{' '}
        Score {item.score.toFixed(2)}. Updated {dateTime(item.updatedAt)}.
      </p>
      <div className="actions">
        <a className="button" href={href.prompt(workspaceId, item.promptId, item.runId)}>
          Read the answers
        </a>
        <button
          disabled={refresh.busy}
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
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await api.setGapStatus(workspaceId, gapId, 'reopen');
                gap.reload();
              })
            }
          >
            Reopen
          </button>
        ) : (
          <button
            disabled={action.busy || item.status === 'drafted'}
            onClick={() =>
              action.run(async () => {
                await api.setGapStatus(workspaceId, gapId, 'dismiss');
                gap.reload();
              })
            }
          >
            Dismiss
          </button>
        )}
      </div>
      {refresh.error && <p className="error">{refresh.error}</p>}
      {refresh.busy === false && !refresh.error && refresh.ran && (
        <p className="ok">Queued. The new brief appears here in a minute or two.</p>
      )}
      {action.error && <p className="error">{action.error}</p>}
      {item.error && <p className="banner warn">{item.error}</p>}

      <div className="columns">
        <div className="main-column">
          {brief ? (
            <>
              <section className="section brief">
                <h2>
                  {brief.action === 'improve'
                    ? 'Improve an existing page'
                    : `Write a new ${brief.pageType}`}
                </h2>
                {brief.improveUrl && (
                  <p>
                    <a href={brief.improveUrl} target="_blank" rel="noopener noreferrer">
                      {brief.improveUrl}
                    </a>
                  </p>
                )}
                <p className="brief-title">{brief.title}</p>
                <ol className="outline">
                  {brief.outline.map((section) => (
                    <li key={section.heading}>
                      <strong>{section.heading}</strong>
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
              <section className="section">
                <h2>What the cited sources cover that you do not</h2>
                <ul>
                  {brief.missingPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <h3>What those sources cover</h3>
                <ul className="muted">
                  {brief.sourcesCover.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>
              {brief.questions.length > 0 && (
                <section className="section">
                  <h2>Questions to answer word for word</h2>
                  <ul>
                    {brief.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </section>
              )}
              {brief.facts.length > 0 && (
                <section className="section">
                  <h2>Facts only you can supply</h2>
                  <p className="muted small">
                    The brief never guesses these. Drafts cannot be published until each is filled
                    in.
                  </p>
                  <ul className="facts">
                    {brief.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className="empty">No brief yet. Refresh it once this prompt has answers.</p>
          )}
        </div>
        <aside className="side-column">
          {item.evidence && (
            <section className="section">
              <h2>Named instead of you</h2>
              <ul className="untracked">
                {item.evidence.competitors.map((competitor) => (
                  <li key={competitor.name}>
                    <span>{competitor.name}</span>
                    <span className="muted">
                      {competitor.count}/{item.evidence!.answers}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {item.sourcesRead && (
            <section className="section">
              <h2>Sources compared</h2>
              <ul className="citations plain">
                {item.sourcesRead.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                      {source.title || hostOf(source.url)}
                    </a>
                    <span className="muted small">
                      {source.ok ? hostOf(source.url) : 'could not read'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="section">
            <h2>Your closest pages</h2>
            {item.ownPages?.length ? (
              <ul className="citations plain">
                {item.ownPages.map((page) => (
                  <li key={page.url}>
                    <a href={page.url} target="_blank" rel="noopener noreferrer">
                      {page.title || page.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                None found. <a href={href.settings(workspaceId)}>Import your sitemap</a> so briefs
                can compare your pages.
              </p>
            )}
          </section>
          {brief && brief.phrases.length > 0 && (
            <section className="section">
              <h2>Phrases the answers use</h2>
              <p className="phrases">
                {brief.phrases.map((phrase) => (
                  <span key={phrase}>{phrase}</span>
                ))}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
