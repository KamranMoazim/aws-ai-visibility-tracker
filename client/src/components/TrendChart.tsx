import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { TrendPoint } from '../lib/api';
import { engineClass, engineLabel, fraction, percent, shortDate } from '../lib/format';

export interface ChartMarker {
  at: string;
  label: string;
}

const HEIGHT = 240;
const MARGIN = { top: 16, right: 84, bottom: 28, left: 40 };
const TICK_COUNT = 4;
const MARKER_LABEL_WIDTH = 480;

export function axisMax(rates: number[]): number {
  const highest = Math.max(0, ...rates);
  return Math.min(1, Math.max(0.2, Math.ceil((highest + 0.02) * 10) / 10));
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function TrendChart({
  points,
  engines,
  markers = [],
}: {
  points: TrendPoint[];
  engines: string[];
  markers?: ChartMarker[];
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const runs = useMemo(() => {
    const byRun = new Map<string, { at: string; byEngine: Record<string, TrendPoint> }>();
    for (const point of points) {
      const entry = byRun.get(point.runId) ?? { at: point.at, byEngine: {} };
      entry.byEngine[point.engine] = point;
      byRun.set(point.runId, entry);
    }
    return [...byRun.entries()]
      .map(([runId, entry]) => ({ runId, ...entry }))
      .sort((left, right) => left.at.localeCompare(right.at));
  }, [points]);
  const series = engines.filter((engine) => runs.some((run) => run.byEngine[engine]));

  if (!runs.length) {
    return <p className="empty">The trend appears after the first completed run.</p>;
  }

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const times = runs.map((run) => new Date(run.at).getTime());
  const minTime = Math.min(...times);
  const span = Math.max(...times) - minTime || 1;
  const xOf = (iso: string) =>
    MARGIN.left +
    (runs.length === 1
      ? innerWidth / 2
      : ((new Date(iso).getTime() - minTime) / span) * innerWidth);
  const yMax = axisMax(
    points.map((point) => point.mentionRate).filter((rate): rate is number => rate !== null),
  );
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => (yMax * index) / TICK_COUNT);
  const yOf = (rate: number) => MARGIN.top + (1 - rate / yMax) * innerHeight;

  function onMove(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left + MARGIN.left;
    let nearest = 0;
    runs.forEach((run, index) => {
      if (Math.abs(xOf(run.at) - x) < Math.abs(xOf(runs[nearest].at) - x)) {
        nearest = index;
      }
    });
    setHover(nearest);
  }

  const hovered = hover === null ? null : runs[hover];
  const lastRun = runs[runs.length - 1];

  return (
    <figure className="trend" ref={ref}>
      <div className="chart-head">
        <ul className="legend" aria-label="Engines">
          {series.map((engine) => (
            <li key={engine} className={engineClass(engine)}>
              <i className="swatch" />
              {engineLabel(engine)}
            </li>
          ))}
        </ul>
        <button className="link-button" onClick={() => setShowTable((current) => !current)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {showTable ? (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Run</th>
              {series.map((engine) => (
                <th scope="col" key={engine}>
                  {engineLabel(engine)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId}>
                <th scope="row">{shortDate(run.at)}</th>
                {series.map((engine) => {
                  const point = run.byEngine[engine];
                  return (
                    <td key={engine}>
                      {point
                        ? `${percent(point.mentionRate)} (${fraction(point.mentioned, point.answers)})`
                        : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-frame">
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Mention rate per engine over time"
          >
            {ticks.map((tick) => (
              <g key={tick} className="grid">
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yOf(tick)} y2={yOf(tick)} />
                <text x={MARGIN.left - 8} y={yOf(tick)} dy="0.32em" textAnchor="end">
                  {Math.round(tick * 100)}%
                </text>
              </g>
            ))}
            {markers.map((marker) => (
              <g key={marker.at + marker.label} className="marker">
                <line
                  x1={xOf(marker.at)}
                  x2={xOf(marker.at)}
                  y1={MARGIN.top}
                  y2={HEIGHT - MARGIN.bottom}
                />
                {width >= MARKER_LABEL_WIDTH && (
                  <text x={xOf(marker.at) + 4} y={MARGIN.top + 10}>
                    {marker.label}
                  </text>
                )}
                <title>{marker.label}</title>
              </g>
            ))}
            {series.map((engine) => {
              const coordinates = runs
                .map((run) => run.byEngine[engine])
                .filter(
                  (point): point is TrendPoint => Boolean(point) && point.mentionRate !== null,
                )
                .map((point) => [xOf(point.at), yOf(point.mentionRate!)] as const);
              const last = coordinates[coordinates.length - 1];
              return (
                <g key={engine} className={`series ${engineClass(engine)}`}>
                  {coordinates.length > 1 && (
                    <path
                      d={coordinates
                        .map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`)
                        .join(' ')}
                    />
                  )}
                  {coordinates.map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r={4} />
                  ))}
                  {last && (
                    <text
                      className="direct-label"
                      x={width - MARGIN.right + 8}
                      y={last[1]}
                      dy="0.32em"
                    >
                      {engineLabel(engine)}
                    </text>
                  )}
                </g>
              );
            })}
            {[runs[0], runs.length > 1 ? lastRun : null].filter(Boolean).map((run) => (
              <text
                key={run!.runId}
                className="axis-label"
                x={xOf(run!.at)}
                y={HEIGHT - 8}
                textAnchor={runs.length === 1 ? 'middle' : run === lastRun ? 'end' : 'start'}
              >
                {shortDate(run!.at)}
              </text>
            ))}
            {hovered && (
              <line
                className="crosshair"
                x1={xOf(hovered.at)}
                x2={xOf(hovered.at)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
              />
            )}
            <rect
              className="hit-area"
              x={MARGIN.left}
              y={MARGIN.top}
              width={innerWidth}
              height={innerHeight}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
          {hovered && (
            <div
              className="tooltip"
              style={{ left: Math.min(xOf(hovered.at) + 12, width - 200), top: MARGIN.top }}
            >
              <strong>Run on {shortDate(hovered.at)}</strong>
              {series.map((engine) => {
                const point = hovered.byEngine[engine];
                return (
                  <div key={engine} className={`tooltip-row ${engineClass(engine)}`}>
                    <i className="swatch" />
                    <span>{engineLabel(engine)}</span>
                    <span className="tooltip-value">
                      {point
                        ? `${percent(point.mentionRate)} ${fraction(point.mentioned, point.answers)}`
                        : 'not run'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <figcaption>Share of answers that name your brand, per engine and run.</figcaption>
    </figure>
  );
}
