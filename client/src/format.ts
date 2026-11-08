import type { EngineId } from './api';

export const ENGINE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  nova: 'Nova',
  sonar: 'Sonar',
  fake: 'Fake',
  all: 'All engines',
};

export const engineLabel = (engine: string) => ENGINE_LABELS[engine] ?? engine;
export const engineClass = (engine: EngineId | string) => `engine-${engine}`;

export function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? 'n/a' : `${Math.round(rate * 100)}%`;
}

export function fraction(numerator: number, denominator: number): string {
  return denominator ? `${numerator}/${denominator}` : 'no answers';
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dollars(value: number | undefined): string {
  return value === undefined ? 'n/a' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
