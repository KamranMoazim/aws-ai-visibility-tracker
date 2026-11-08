import { api, type Answer, type WorkspaceView } from './api';
import { dateTime, engineClass, engineLabel, hostOf } from './format';
import { HighlightedText } from './Highlighted';
import { TrendChart } from './TrendChart';
import { href } from './route';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

function AnswerCard({ answer, view }: { answer: Answer; view: WorkspaceView }) {
  const { brand } = view.workspace;
  const ownHost = hostOf(`https://${brand.domain}`);
  if (answer.status === 'failed') {
    return (
      <article className="answer failed">
        <header>Sample {answer.sample + 1}</header>
        <p className="muted">No answer: {answer.error}</p>
      </article>
    );
  }
  const mentions = answer.mentions ?? [];
  return (
    <article className="answer">
      <header>
        <span>Sample {answer.sample + 1}</span>
        <span className="muted small">{answer.model}</span>
      </header>
      {mentions.length > 0 && (
        <ol className="mentions" aria-label="Brands in order">
          {mentions.map((mention) => (
            <li
              key={mention.key}
              className={
                mention.brandId === 'own' ? 'own' : mention.brandId ? 'competitor' : 'untracked'
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
          The two readers disagreed on{' '}
          {[...answer.disagreement.onlyMatcher, ...answer.disagreement.onlyLlm].join(', ')}. Check
          the text.
        </p>
      )}
      {answer.extractError && (
        <p className="flag">Read by name matching only: the model call failed.</p>
      )}
      <div className="answer-text">
        <HighlightedText
          text={answer.text ?? ''}
          brand={brand}
          competitors={view.competitors}
          mentions={mentions}
        />
      </div>
      {answer.citations && answer.citations.length > 0 && (
        <ul className="citations">
          {answer.citations.map((citation) => (
            <li key={citation.url} className={hostOf(citation.url).endsWith(ownHost) ? 'own' : ''}>
              <a href={citation.url} target="_blank" rel="noopener noreferrer nofollow">
                {citation.title || hostOf(citation.url)}
              </a>
              <span className="muted small">{hostOf(citation.url)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function PromptPage({
  workspaceId,
  promptId,
  runId,
}: {
  workspaceId: string;
  promptId: string;
  runId?: string;
}) {
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  const answers = useLoad(
    () => api.answers(workspaceId, promptId, runId),
    [workspaceId, promptId, runId],
  );
  const runs = useLoad(() => api.runs(workspaceId), [workspaceId]);
  const findGap = useAction();
  const trend = useLoad(() => api.promptTrend(workspaceId, promptId), [workspaceId, promptId]);

  if (view.error || answers.error) {
    return <p className="error">{view.error ?? answers.error}</p>;
  }
  if (!view.data || !answers.data) {
    return <p className="muted">Loading</p>;
  }
  const engines = [...new Set(answers.data.answers.map((answer) => answer.engine))];
  const sources = new Map<string, number>();
  for (const answer of answers.data.answers) {
    for (const host of new Set((answer.citations ?? []).map((citation) => hostOf(citation.url)))) {
      sources.set(host, (sources.get(host) ?? 0) + 1);
    }
  }
  const answered = answers.data.answers.filter((answer) => answer.status !== 'failed').length;

  return (
    <div className="prompt-page">
      <a className="back" href={href.workspace(workspaceId)}>
        Back to {view.data.workspace.name}
      </a>
      <h1 className="prompt-title">{answers.data.prompt.text}</h1>
      <div className="prompt-meta">
        <span className="stage">{answers.data.prompt.stage}</span>
        <label>
          Run{' '}
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
      </div>
      <div className="actions">
        <button
          disabled={findGap.busy || findGap.ran}
          onClick={() =>
            findGap.run(async () => {
              await api.findGap(workspaceId, promptId);
            })
          }
        >
          Find the gap
        </button>
        <a className="button" href={href.gap(workspaceId, promptId)}>
          Open the brief
        </a>
      </div>
      {findGap.error && <p className="error">{findGap.error}</p>}
      {findGap.ran && !findGap.error && (
        <p className="ok">
          Queued. The brief compares the cited pages with yours and appears under Gaps shortly.
        </p>
      )}
      <ul className="key" aria-label="Highlight key">
        <li>
          <mark className="brand-own">{view.data.workspace.brand.name}</mark> your brand
        </li>
        <li>
          <mark className="brand-competitor">Competitor</mark> tracked
        </li>
        <li>
          <mark className="brand-untracked">Other</mark> not tracked
        </li>
      </ul>
      {!answers.data.answers.length && <p className="empty">This prompt has no answers yet.</p>}
      {trend.data && trend.data.points.length > 0 && (
        <section className="section">
          <h2>This prompt over time</h2>
          <TrendChart
            points={trend.data.points.filter((point) => point.engine !== 'all')}
            engines={view.data.workspace.engines}
            markers={trend.data.links.map((link) => ({
              at: link.publishedAt,
              label: `Published: ${link.title.slice(0, 32)}`,
            }))}
          />
          {trend.data.links.length > 0 && (
            <p className="muted small">
              Engines need to crawl and index a new page first, so expect weeks before it can show
              up here.
            </p>
          )}
        </section>
      )}
      {sources.size > 0 && (
        <section className="section">
          <h2>Sources these answers cite</h2>
          <ol className="domains inline">
            {[...sources.entries()]
              .sort((left, right) => right[1] - left[1])
              .slice(0, 10)
              .map(([host, count]) => (
                <li key={host}>
                  <span>{host}</span>
                  <span className="muted">
                    {count}/{answered}
                  </span>
                </li>
              ))}
          </ol>
        </section>
      )}
      <div
        className="engine-columns"
        style={{ gridTemplateColumns: `repeat(${engines.length || 1}, minmax(0, 1fr))` }}
      >
        {engines.map((engine) => (
          <section key={engine} className={`engine-column ${engineClass(engine)}`}>
            <h2>
              <i className="swatch" />
              {engineLabel(engine)}
            </h2>
            {answers
              .data!.answers.filter((answer) => answer.engine === engine)
              .map((answer) => (
                <AnswerCard
                  key={`${answer.engine}-${answer.sample}`}
                  answer={answer}
                  view={view.data!}
                />
              ))}
          </section>
        ))}
      </div>
      <p className="muted small note">
        These are API answers with web search. The ChatGPT and Perplexity apps add memory, location
        and their own routing, so treat these as a strong signal rather than a copy of what one
        person sees.
      </p>
    </div>
  );
}
