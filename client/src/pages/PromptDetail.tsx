import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { EmptyState, ErrorText, Loading, Notice } from '../components/Feedback';
import { HighlightedText } from '../components/Highlighted';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { TrendChart } from '../components/TrendChart';
import { api, type Answer } from '../lib/api';
import { dateTime, engineClass, engineLabel, hostOf } from '../lib/format';
import { useAction } from '../lib/hooks/useAction';
import { useLoad } from '../lib/hooks/useLoad';

function AnswerCard({ answer }: { answer: Answer }) {
  const { workspace, competitors } = useWorkspace();
  const ownHost = hostOf(`https://${workspace.brand.domain}`);
  if (answer.status === 'failed') {
    return (
      <article className="answer is-failed">
        <header className="answer-head">Sample {answer.sample + 1}</header>
        <p className="muted">No answer: {answer.error}</p>
      </article>
    );
  }
  const mentions = answer.mentions ?? [];
  return (
    <article className="answer">
      <header className="answer-head">
        <span>Sample {answer.sample + 1}</span>
        <span className="muted">{answer.model}</span>
      </header>
      {mentions.length > 0 && (
        <ol className="mention-order" aria-label="Brands in the order named">
          {mentions.map((mention) => (
            <li
              key={mention.key}
              className={
                mention.brandId === 'own'
                  ? 'is-own'
                  : mention.brandId
                    ? 'is-competitor'
                    : 'is-untracked'
              }
            >
              {mention.name}
              {mention.recommended && <span className="recommended">recommended</span>}
            </li>
          ))}
        </ol>
      )}
      {answer.disagreement && (
        <p className="flag">
          The name matcher and the model disagreed on{' '}
          {[...answer.disagreement.onlyMatcher, ...answer.disagreement.onlyLlm].join(', ')}. Check
          the text.
        </p>
      )}
      {answer.extractError && (
        <p className="flag">Read by name matching only: the model call failed.</p>
      )}
      <blockquote className="answer-text">
        <HighlightedText
          text={answer.text ?? ''}
          brand={workspace.brand}
          competitors={competitors}
          mentions={mentions}
        />
      </blockquote>
      {answer.citations && answer.citations.length > 0 && (
        <ul className="sources">
          {answer.citations.map((citation) => (
            <li
              key={citation.url}
              className={hostOf(citation.url).endsWith(ownHost) ? 'is-own' : undefined}
            >
              <a href={citation.url} target="_blank" rel="noopener noreferrer nofollow">
                {citation.title || hostOf(citation.url)}
              </a>
              <span className="source-host">{hostOf(citation.url)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function PromptDetail({ promptId, runId }: { promptId: string; runId?: string }) {
  const { workspaceId, workspace } = useWorkspace();
  const answers = useLoad(
    () => api.answers(workspaceId, promptId, runId),
    [workspaceId, promptId, runId],
  );
  const runs = useLoad(() => api.runs(workspaceId), [workspaceId]);
  const trend = useLoad(() => api.promptTrend(workspaceId, promptId), [workspaceId, promptId]);
  const findGap = useAction();

  if (answers.error) {
    return <ErrorText message={answers.error} />;
  }
  if (!answers.data) {
    return <Loading />;
  }
  const { prompt } = answers.data;
  const engines = [...new Set(answers.data.answers.map((answer) => answer.engine))];
  const answered = answers.data.answers.filter((answer) => answer.status !== 'failed').length;
  const sources = new Map<string, number>();
  for (const answer of answers.data.answers) {
    for (const host of new Set((answer.citations ?? []).map((citation) => hostOf(citation.url)))) {
      sources.set(host, (sources.get(host) ?? 0) + 1);
    }
  }

  return (
    <div className="prompt-detail">
      <PageHeader
        serif
        back={{ href: href.workspace(workspaceId), label: 'Overview' }}
        title={prompt.text}
        description={
          <span className="row-meta">
            <span className="chip">{prompt.stage}</span>
            <label className="inline-select">
              <span>Run</span>
              <select
                value={answers.data.runId ?? ''}
                onChange={(event) => {
                  window.location.hash = href.prompt(workspaceId, promptId, event.target.value);
                }}
              >
                {runs.data?.runs
                  .filter((run) => run.status === 'complete')
                  .map((run) => (
                    <option key={run.runId} value={run.runId}>
                      {dateTime(run.startedAt)}
                    </option>
                  ))}
              </select>
            </label>
          </span>
        }
        actions={
          <>
            <a className="button" href={href.gap(workspaceId, promptId)}>
              Open the brief
            </a>
            <button
              className="button"
              disabled={findGap.busy || findGap.ran}
              onClick={() =>
                findGap.run(async () => {
                  await api.findGap(workspaceId, promptId);
                })
              }
            >
              Find the gap
            </button>
          </>
        }
      />
      <ErrorText message={findGap.error} />
      {findGap.ran && !findGap.error && (
        <Notice tone="ok">
          Queued. The brief compares the cited pages with yours and appears under Gaps shortly.
        </Notice>
      )}

      <ul className="legend-key" aria-label="Highlight key">
        <li>
          <mark className="brand-own">{workspace.brand.name}</mark> you
        </li>
        <li>
          <mark className="brand-competitor">Competitor</mark> tracked
        </li>
        <li>
          <mark className="brand-untracked">Other brand</mark> not tracked
        </li>
      </ul>

      {!answers.data.answers.length && (
        <EmptyState title="No answers for this prompt yet">
          Run the workspace to collect some.
        </EmptyState>
      )}

      {engines.length > 0 && (
        <div className="answer-columns" data-count={Math.min(engines.length, 3)}>
          {engines.map((engine) => (
            <section key={engine} className={`answer-column ${engineClass(engine)}`}>
              <h2>
                <i className="swatch" aria-hidden="true" />
                {engineLabel(engine)}
              </h2>
              {answers
                .data!.answers.filter((answer) => answer.engine === engine)
                .map((answer) => (
                  <AnswerCard key={`${answer.engine}-${answer.sample}`} answer={answer} />
                ))}
            </section>
          ))}
        </div>
      )}

      <div className="prompt-foot">
        {sources.size > 0 && (
          <Panel title="Sources these answers cite">
            <ol className="ranked">
              {[...sources.entries()]
                .sort((left, right) => right[1] - left[1])
                .slice(0, 10)
                .map(([host, count]) => (
                  <li key={host}>
                    <span className="ranked-name">{host}</span>
                    <span className="ranked-value">
                      {count}/{answered}
                    </span>
                  </li>
                ))}
            </ol>
          </Panel>
        )}
        {trend.data && trend.data.points.length > 0 && (
          <Panel title="This prompt over time">
            <TrendChart
              points={trend.data.points.filter((point) => point.engine !== 'all')}
              engines={workspace.engines}
              markers={trend.data.links.map((link) => ({
                at: link.publishedAt,
                label: `Published: ${link.title.slice(0, 32)}`,
              }))}
            />
            {trend.data.links.length > 0 && (
              <p className="muted small">
                Engines need to crawl and index a new page first, so expect weeks.
              </p>
            )}
          </Panel>
        )}
      </div>
      <p className="footnote">
        These are API answers with web search. The ChatGPT and Perplexity apps add memory, location
        and their own routing, so read them as a strong signal rather than a copy of what one person
        sees.
      </p>
    </div>
  );
}
