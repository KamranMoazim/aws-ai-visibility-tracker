import { useEffect } from 'react';
import { api, type Competitor, type Run, type TrendPoint, type WorkspaceView } from './api';
import {
  dateTime,
  dollars,
  engineClass,
  engineLabel,
  fraction,
  hostOf,
  percent,
  shortDate,
} from './format';
import { href } from './route';
import { SampleDots } from './SampleDots';
import { TrendChart } from './TrendChart';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

const POLL_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;

function RunBanner({ run }: { run: Run }) {
  if (run.status === 'running') {
    const done = run.answered + run.failed;
    return (
      <p className="banner running" role="status">
        Asking engines: {done} of {run.plannedCalls} answers in, {run.extracted} read.
      </p>
    );
  }
  if (run.status === 'refused') {
    return <p className="banner warn">The last run did not start: {run.refusedReason}.</p>;
  }
  if (run.status === 'failed') {
    return (
      <p className="banner warn">
        The last run failed: {run.refusedReason ?? 'no answers could be read'}.
      </p>
    );
  }
  return null;
}

function Headline({
  brand,
  total,
  startedAt,
}: {
  brand: string;
  total?: TrendPoint;
  startedAt: string;
}) {
  if (!total || !total.answers) {
    return <p className="headline">The last run returned no readable answers.</p>;
  }
  return (
    <div className="headline-block">
      <p className="headline">
        AI answers named <mark className="brand-own">{brand}</mark> in {total.mentioned} of{' '}
        {total.answers} answers in the run on {shortDate(startedAt)}.
      </p>
      <dl className="stat-row">
        <div>
          <dt>Named first</dt>
          <dd>
            {percent(total.firstMentionRate)}{' '}
            <small>{fraction(total.firstMentions, total.answers)}</small>
          </dd>
        </div>
        <div>
          <dt>Average position</dt>
          <dd>{total.averagePosition === null ? 'n/a' : total.averagePosition.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Share of voice</dt>
          <dd>
            {percent(total.shareOfVoice)}{' '}
            <small>{fraction(total.mentioned, total.trackedMentions)}</small>
          </dd>
        </div>
        <div>
          <dt>Recommended</dt>
          <dd>
            {percent(total.recommendedRate)}{' '}
            <small>{fraction(total.recommended, total.answers)}</small>
          </dd>
        </div>
        <div>
          <dt>Your site cited</dt>
          <dd>
            {percent(total.citationRate)} <small>{fraction(total.cited, total.answers)}</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ShareOfVoice({
  total,
  brand,
  competitors,
}: {
  total: TrendPoint;
  brand: string;
  competitors: Competitor[];
}) {
  const names: Record<string, string> = { own: brand };
  competitors.forEach((competitor) => {
    names[competitor.slug!] = competitor.name;
  });
  const rows = Object.entries(total.brandMentions).sort((left, right) => right[1] - left[1]);
  if (!rows.length || !total.trackedMentions) {
    return <p className="empty">No tracked brands were named.</p>;
  }
  return (
    <ul className="bars">
      {rows.map(([brandId, count]) => (
        <li key={brandId} className={brandId === 'own' ? 'own' : ''}>
          <span className="bar-label">{names[brandId] ?? brandId}</span>
          <span className="bar-track">
            <span style={{ width: `${(count / total.trackedMentions) * 100}%` }} />
          </span>
          <span className="bar-value">{percent(count / total.trackedMentions)}</span>
        </li>
      ))}
    </ul>
  );
}

export function WorkspacePage({ workspaceId }: { workspaceId: string }) {
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  const visibility = useLoad(() => api.visibility(workspaceId), [workspaceId]);
  const runs = useLoad(() => api.runs(workspaceId), [workspaceId]);
  const brands = useLoad(() => api.brands(workspaceId), [workspaceId]);
  const runAction = useAction();
  const trackAction = useAction();

  const latestRun = runs.data?.runs[0];
  const running = latestRun?.status === 'running';
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(runs.reload, POLL_MS);
    return () => clearInterval(timer);
  }, [running, runs.reload]);
  useEffect(() => {
    if (latestRun && latestRun.status !== 'running') {
      visibility.reload();
      brands.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRun?.runId, latestRun?.status]);

  if (view.error) {
    return <p className="error">{view.error}</p>;
  }
  if (!view.data) {
    return <p className="muted">Loading</p>;
  }
  const { workspace, competitors, prompts } = view.data as WorkspaceView;
  const latest = visibility.data?.latestRun;
  const points = visibility.data?.points ?? [];
  const total = points.find((point) => point.runId === latest?.runId && point.engine === 'all');
  const gapIds = new Set(latest?.gapCandidates?.map((gap) => gap.promptId));
  const engines = workspace.engines;
  const lastManual = workspace.lastManualRunAt ? new Date(workspace.lastManualRunAt).getTime() : 0;
  const coolingDown = Date.now() - lastManual < HOUR_MS;

  function startRun() {
    void runAction.run(async () => {
      await api.startRun(workspaceId);
      view.reload();
      setTimeout(() => runs.reload(), 1500);
    });
  }

  function track(name: string) {
    void trackAction.run(async () => {
      await api.saveCompetitors(workspaceId, [...competitors, { name, aliases: [] }]);
      view.reload();
      brands.reload();
    });
  }

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1>{workspace.name}</h1>
          <p className="muted">
            {workspace.brand.domain}, {prompts.filter((prompt) => prompt.active).length} prompts,{' '}
            {engines.map(engineLabel).join(', ')}, {workspace.samples} samples each
          </p>
        </div>
        <div className="actions">
          <a className="button" href={href.gaps(workspaceId)}>
            Gaps
          </a>
          <a className="button" href={href.settings(workspaceId)}>
            Settings
          </a>
          <button
            className="primary"
            onClick={startRun}
            disabled={runAction.busy || running || coolingDown}
            title={coolingDown ? 'Manual runs are limited to one per hour' : undefined}
          >
            {running ? 'Run in progress' : 'Run now'}
          </button>
        </div>
      </div>
      {runAction.error && <p className="error">{runAction.error}</p>}
      {latestRun && <RunBanner run={latestRun} />}

      {latest ? (
        <Headline brand={workspace.brand.name} total={total} startedAt={latest.startedAt} />
      ) : (
        <p className="headline muted">
          No completed runs yet. Add prompts in settings, then run now or wait for the Monday run.
        </p>
      )}

      <section className="section">
        <h2>Mention rate over time</h2>
        <TrendChart points={points.filter((point) => point.engine !== 'all')} engines={engines} />
      </section>

      <div className="columns">
        <section className="section main-column">
          <h2>Who comes up, by prompt</h2>
          <p className="muted small">
            Each dot is one answer from the latest run. A filled dot names {workspace.brand.name}.
          </p>
          <table className="matrix">
            <thead>
              <tr>
                <th scope="col">Prompt</th>
                {engines.map((engine) => (
                  <th scope="col" key={engine} className={engineClass(engine)}>
                    {engineLabel(engine)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prompts
                .filter((prompt) => prompt.active)
                .map((prompt) => (
                  <tr key={prompt.promptId} className={gapIds.has(prompt.promptId) ? 'gap' : ''}>
                    <th scope="row">
                      <a href={href.prompt(workspaceId, prompt.promptId, latest?.runId)}>
                        {prompt.text}
                      </a>
                      <span className="stage">{prompt.stage}</span>
                      {gapIds.has(prompt.promptId) && (
                        <a className="gap-tag" href={href.gap(workspaceId, prompt.promptId)}>
                          Gap
                        </a>
                      )}
                    </th>
                    {engines.map((engine) => {
                      const cell = latest?.summary?.[prompt.promptId]?.[engine];
                      return (
                        <td key={engine}>
                          {cell ? <SampleDots hits={cell[0]} total={cell[1]} /> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
          {latest?.diff && (latest.diff.lost.length > 0 || latest.diff.gained.length > 0) && (
            <div className="changes">
              <h3>Since the previous run</h3>
              <ul>
                {latest.diff.gained.map((change) => (
                  <li key={`g${change.promptId}${change.engine}`} className="gained">
                    Now named on {engineLabel(change.engine)}:{' '}
                    {prompts.find((prompt) => prompt.promptId === change.promptId)?.text}
                  </li>
                ))}
                {latest.diff.lost.map((change) => (
                  <li key={`l${change.promptId}${change.engine}`} className="lost">
                    No longer named on {engineLabel(change.engine)}:{' '}
                    {prompts.find((prompt) => prompt.promptId === change.promptId)?.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="side-column">
          {total && (
            <section className="section">
              <h2>Share of voice</h2>
              <ShareOfVoice total={total} brand={workspace.brand.name} competitors={competitors} />
            </section>
          )}
          {total && Object.keys(total.citedDomains ?? {}).length > 0 && (
            <section className="section">
              <h2>Most cited sites</h2>
              <ol className="domains">
                {Object.entries(total.citedDomains)
                  .slice(0, 8)
                  .map(([domain, count]) => (
                    <li
                      key={domain}
                      className={
                        domain.endsWith(hostOf(`https://${workspace.brand.domain}`)) ? 'own' : ''
                      }
                    >
                      <span>{domain}</span>
                      <span className="muted">{fraction(count, total.answers)}</span>
                    </li>
                  ))}
              </ol>
            </section>
          )}
          <section className="section">
            <h2>Brands you are not tracking</h2>
            {brands.data && !brands.data.brands.length && (
              <p className="empty">Every brand in the answers is on your list.</p>
            )}
            {trackAction.error && <p className="error">{trackAction.error}</p>}
            <ul className="untracked">
              {brands.data?.brands.slice(0, 8).map((brand) => (
                <li key={brand.slug}>
                  <span>
                    {brand.name}
                    <small className="muted">
                      {' '}
                      {brand.mentions} mentions, {brand.promptIds.length} prompts
                    </small>
                  </span>
                  <button
                    className="link-button"
                    disabled={trackAction.busy || competitors.length >= 10}
                    onClick={() => track(brand.name)}
                  >
                    Track
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="section">
            <h2>Runs</h2>
            <ul className="runs">
              {runs.data?.runs.slice(0, 6).map((run) => (
                <li key={run.runId}>
                  <span>
                    {dateTime(run.startedAt)} <small className="muted">{run.trigger}</small>
                  </span>
                  <span className={`run-status ${run.status}`}>{run.status}</span>
                  <span className="muted small">
                    {run.extracted}/{run.plannedCalls} read
                    {run.failed ? `, ${run.failed} failed` : ''}, {dollars(run.cost?.total)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
