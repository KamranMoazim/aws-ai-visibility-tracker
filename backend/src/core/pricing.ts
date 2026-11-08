import type { EngineId } from '../engines/types.js';

export interface EngineUsage {
  answers: number;
  searchCalls: number;
  inputTokens: number;
  outputTokens: number;
}

interface Price {
  perSearch: number;
  perMillionInput: number;
  perMillionOutput: number;
}

export const ENGINE_PRICES: Record<EngineId, Price> = {
  openai: { perSearch: 10 / 1000, perMillionInput: 0.25, perMillionOutput: 2 },
  nova: { perSearch: 30 / 1000, perMillionInput: 0.3, perMillionOutput: 2.5 },
  sonar: { perSearch: 5 / 1000, perMillionInput: 1, perMillionOutput: 1 },
  fake: { perSearch: 0, perMillionInput: 0, perMillionOutput: 0 },
};

export const EXTRACTION_PRICE = { perMillionInput: 0.3, perMillionOutput: 2.5 };

export const emptyUsage = (): EngineUsage => ({
  answers: 0,
  searchCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
});

const roundCents = (dollars: number) => Math.round(dollars * 10000) / 10000;

export function engineCost(engine: EngineId, usage: EngineUsage): number {
  const price = ENGINE_PRICES[engine];
  return roundCents(
    usage.searchCalls * price.perSearch +
      (usage.inputTokens / 1_000_000) * price.perMillionInput +
      (usage.outputTokens / 1_000_000) * price.perMillionOutput,
  );
}

export function extractionCost(inputTokens: number, outputTokens: number): number {
  return roundCents(
    (inputTokens / 1_000_000) * EXTRACTION_PRICE.perMillionInput +
      (outputTokens / 1_000_000) * EXTRACTION_PRICE.perMillionOutput,
  );
}
