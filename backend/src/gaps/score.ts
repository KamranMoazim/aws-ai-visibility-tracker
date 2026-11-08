import type { PromptRecord } from '../core/schemas.js';

export const STAGE_WEIGHT: Record<PromptRecord['stage'], number> = {
  problem: 1,
  solution: 1.5,
  comparison: 2,
};
const NEVER_CITED_RATE = 0.25;

export function gapScore(
  missingRate: number,
  missingEngines: number,
  stage: PromptRecord['stage'],
): number {
  const rate = missingEngines > 0 ? missingRate : Math.max(missingRate, NEVER_CITED_RATE);
  return Math.round(rate * Math.max(missingEngines, 1) * STAGE_WEIGHT[stage] * 1000) / 1000;
}
