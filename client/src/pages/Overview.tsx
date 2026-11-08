import { useEffect } from 'react';
import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { EmptyState, ErrorText, Notice } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { SampleDots } from '../components/SampleDots';
import { TrendChart } from '../components/TrendChart';
import { api, type Competitor, type Run, type TrendPoint } from '../lib/api';
import {
  dateTime,
  dollars,
  engineClass,
  engineLabel,
  fraction,
  hostOf,
  percent,
  shortDate,
} from '../lib/format';
import { useAction } from '../lib/hooks/useAction';
import { useLoad } from '../lib/hooks/useLoad';

const POLL_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;

function RunStatus({ run }: { run: Run }) {
  if (run.status === 'running') {
    const done = run.answered + run.failed;
    const share = run.plannedCalls ? Math.round((done / run.plannedCalls) * 100) : 0;
    return (
      <Notice tone="info">
        <div className="progress-line">
          <span>
            Asking engines: {done} of {run.plannedCalls} answers in, {run.extracted} read.
          </span>
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
        </div>
      </Notice>
    );
  }
  if (run.status === 'refused') {
    return <Notice tone="warn">The last run did not start: {run.refusedReason}.</Notice>;
  }
  if (run.status === 'failed') {
    return (
      <Notice tone="warn">
        The last run failed: {run.refusedReason ?? 'no answers could be read'}.
      </Notice>
    );
  }
  return null;
}

function Verdict({
  brand,
  total,
  startedAt,
}: {
  brand: string;
  total?: TrendPoint;
  startedAt: string;
}) {
  if (!total || !total.answers) {
    return <p className="verdict-sentence">The last run returned no readable answers.</p>;
  }
  const stats = [
    {
      label: 'Named first',
      value: percent(total.firstMentionRate),
      detail: fraction(total.firstMentions, total.answers),
    },
    {
      label: 'Average position',
      value: total.averagePosition === null ? 'n/a' : total.averagePosition.toFixed(1),
      detail: total.mentioned ? `across ${total.mentioned} answers` : 'never named',
    },
    {
      label: 'Share of voice',
      value: percent(total.shareOfVoice),
      detail: fraction(total.mentioned, total.trackedMentions),
    },
    {
      label: 'Recommended',
      value: percent(total.recommendedRate),
      detail: fraction(total.recommended, total.answers),
    },
    {
      label: 'Your site cited',
      value: percent(total.citationRate),
      detail: fraction(total.cited, total.answers),
    },
  ];
  return (
    <section className="verdict" aria-label="Latest run">
      <p className="verdict-sentence">
        On {shortDate(startedAt)}, AI answers named <mark className="brand-own">{brand}</mark> in{' '}
        <strong>
          {total.mentioned} of {total.answers}
        </strong>{' '}
        answers.
      </p>
      <dl className="stats">
        {stats.map((stat) => (
          <div key={stat.label} className="stat">
            <dt>{stat.label}</dt>
            <dd>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-detail">{stat.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
    return <p className="muted">No tracked brands were named.</p>;
  }
  return (
    <ul className="bars">
      {rows.map(([brandId, count]) => (
        <li key={brandId} className={brandId === 'own' ? 'is-own' : undefined}>
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

export function Overview() {
  const { workspaceId, workspace, competitors, prompts, reload } = useWorkspace();
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

  const latest = visibility.data?.latestRun;
  const points = visibility.data?.points ?? [];
  const total = points.find((point) => point.runId === latest?.runId && point.engine === 'all');
  const gapIds = new Set(latest?.gapCandidates?.map((gap) => gap.promptId));
  const activePrompts = prompts.filter((prompt) => prompt.active);
  const coolingDown =
    Date.now() - (workspace.lastManualRunAt ? new Date(workspace.lastManualRunAt).getTime() : 0) <
    HOUR_MS;
  const ownHost = hostOf(`https://${workspace.brand.domain}`);

  function startRun() {
    void runAction.run(async () => {
      await api.startRun(workspaceId);
      reload();
      setTimeout(runs.reload, 1500);
    });
  }

  function track(name: string) {
    void trackAction.run(async () => {
      await api.saveCompetitors(workspaceId, [...competitors, { name, aliases: [] }]);
      reload();
      brands.reload();
    });
  }

  return (
    <div className="overview">
      <PageHeader
        title={workspace.name}
        description={
          <>
            {workspace.brand.domain}. {activePrompts.length} prompts asked of{' '}
            {workspace.engines.map(engineLabel).join(', ')}, {workspace.samples}{' '}
            {workspace.samples === 1 ? 'sample' : 'samples'} each,{' '}
            {workspace.schedule === 'weekly' ? 'every Monday' : 'when you run it'}.
          </>
        }
        actions={
          <button
            className="button button-primary"
            onClick={startRun}
            disabled={runAction.busy || running || coolingDown || !activePrompts.length}
            title={coolingDown ? 'Manual runs are limited to one per hour' : undefined}
          >
            {running ? 'Running' : 'Run now'}
          </button>
        }
      />
      <ErrorText message={runAction.error} />
      {latestRun && <RunStatus run={latestRun} />}

      {latest ? (
        <Verdict brand={workspace.brand.name} total={total} startedAt={latest.startedAt} />
      ) : (
        <EmptyState title="No completed runs yet">
          {activePrompts.length ? (
            <>Press Run now, or wait for the Monday run.</>
          ) : (
            <>
              Add the questions your buyers ask in <a href={href.settings(workspaceId)}>settings</a>
              , then run.
            </>
          )}
        </EmptyState>
      )}

      <div className="overview-grid">
        <div className="overview-main">
          <Panel title="Mention rate over time">
            <TrendChart
              points={points.filter((point) => point.engine !== 'all')}
              engines={workspace.engines}
              markers={(visibility.data?.markers ?? []).map((marker) => ({
                at: marker.at,
                label: `Published: ${marker.label.slice(0, 32)}`,
              }))}
            />
          </Panel>

          <Panel
            title="Who comes up, by prompt"
            aside={
              <span className="muted small">
                Each dot is one answer. Filled means {workspace.brand.name} was named.
              </span>
            }
          >
            {activePrompts.length ? (
              <div className="table-scroll">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th scope="col">Buyer question</th>
                      {workspace.engines.map((engine) => (
                        <th scope="col" key={engine} className={engineClass(engine)}>
                          <i className="swatch" aria-hidden="true" />
                          {engineLabel(engine)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePrompts.map((prompt) => (
                      <tr
                        key={prompt.promptId}
                        className={gapIds.has(prompt.promptId) ? 'is-gap' : undefined}
                      >
                        <th scope="row">
                          <a href={href.prompt(workspaceId, prompt.promptId, latest?.runId)}>
                            {prompt.text}
                          </a>
                          <span className="row-meta">
                            <span className="chip">{prompt.stage}</span>
                            {gapIds.has(prompt.promptId) && (
                              <a
                                className="chip chip-gap"
                                href={href.gap(workspaceId, prompt.promptId)}
                              >
                                Gap
                              </a>
                            )}
                          </span>
                        </th>
                        {workspace.engines.map((engine) => {
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
              </div>
            ) : (
              <p className="muted">
                No prompts yet. <a href={href.settings(workspaceId)}>Add buyer questions</a>.
              </p>
            )}
          </Panel>

          {latest?.diff && (latest.diff.lost.length > 0 || latest.diff.gained.length > 0) && (
            <Panel title="Since the previous run">
              <ul className="changes">
                {latest.diff.gained.map((change) => (
                  <li key={`g${change.promptId}${change.engine}`} className="is-gained">
                    <strong>Now named</strong> on {engineLabel(change.engine)}:{' '}
                    {prompts.find((prompt) => prompt.promptId === change.promptId)?.text}
                  </li>
                ))}
                {latest.diff.lost.map((change) => (
                  <li key={`l${change.promptId}${change.engine}`} className="is-lost">
                    <strong>No longer named</strong> on {engineLabel(change.engine)}:{' '}
                    {prompts.find((prompt) => prompt.promptId === change.promptId)?.text}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="overview-rail">
          {total && (
            <Panel title="Share of voice">
              <ShareOfVoice total={total} brand={workspace.brand.name} competitors={competitors} />
            </Panel>
          )}
          {total && Object.keys(total.citedDomains ?? {}).length > 0 && (
            <Panel title="Most cited sites">
              <ol className="ranked">
                {Object.entries(total.citedDomains)
                  .slice(0, 8)
                  .map(([domain, count]) => (
                    <li key={domain} className={domain.endsWith(ownHost) ? 'is-own' : undefined}>
                      <span className="ranked-name">{domain}</span>
                      <span className="ranked-value">{fraction(count, total.answers)}</span>
                    </li>
                  ))}
              </ol>
            </Panel>
          )}
          <Panel title="Brands you are not tracking">
            {brands.data && !brands.data.brands.length && (
              <p className="muted">Every brand in the answers is on your list.</p>
            )}
            <ErrorText message={trackAction.error} />
            <ul className="ranked">
              {brands.data?.brands.slice(0, 8).map((brand) => (
                <li key={brand.slug}>
                  <span className="ranked-name">
                    {brand.name}
                    <span className="ranked-detail">
                      {brand.mentions} mentions in {brand.promptIds.length}{' '}
                      {brand.promptIds.length === 1 ? 'prompt' : 'prompts'}
                    </span>
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
          </Panel>
          <Panel title="Recent runs">
            {!runs.data?.runs.length && <p className="muted">None yet.</p>}
            <ul className="runs">
              {runs.data?.runs.slice(0, 6).map((run) => (
                <li key={run.runId}>
                  <span className={`status-dot status-${run.status}`} aria-hidden="true" />
                  <span className="run-when">
                    {dateTime(run.startedAt)}
                    <span className="ranked-detail">
                      {run.status}, {run.extracted}/{run.plannedCalls} read
                      {run.failed ? `, ${run.failed} failed` : ''}
                    </span>
                  </span>
                  <span className="run-cost">{dollars(run.cost?.total)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
