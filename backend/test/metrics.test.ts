import { ALL_ENGINES, ALL_PROMPTS } from '../src/core/keys.js';
import {
  computeRollups,
  diffSummaries,
  findGapCandidates,
  ratesOf,
  rollupKey,
  summarize,
  type AnswerForMetrics,
} from '../src/core/metrics.js';
import { engineCost } from '../src/core/pricing.js';
import { buildWorkPlan } from '../src/core/work.js';
import type { AnswerRecord } from '../src/data/answers.js';
import type { Mention } from '../src/extraction/merge.js';
import { costOf, untrackedSightings } from '../src/run-aggregate/handler.js';
import { check, finish } from './helpers.js';

const mention = (key: string, position: number, recommended = false): Mention => ({
  key,
  name: key,
  brandId: key.startsWith('x:') ? undefined : key,
  position,
  recommended,
  sentiment: 'neutral',
  source: 'both',
});
const answer = (
  promptId: string,
  engine: string,
  mentions: Mention[],
  citations: string[] = [],
  status: AnswerForMetrics['status'] = 'extracted',
): AnswerForMetrics => ({
  promptId,
  engine,
  status,
  mentions,
  citations: citations.map((url) => ({ url })),
});

const answers = [
  answer('p1', 'openai', [mention('own', 1, true), mention('wise', 2)], ['https://acmepay.io/a']),
  answer('p1', 'openai', [mention('wise', 1), mention('own', 2)]),
  answer('p1', 'openai', [mention('wise', 1), mention('x:monzo', 2)]),
  answer('p1', 'nova', [mention('wise', 1)]),
  answer('p1', 'nova', [mention('payoneer', 1)]),
  answer('p1', 'nova', [], [], 'failed'),
  answer('p2', 'openai', [mention('own', 1)]),
];
const rollups = computeRollups(answers, 'acmepay.io');
const openai = ratesOf(rollups.get(rollupKey('p1', 'openai'))!);
check('mention rate 2/3', openai.mentionRate === 0.6667, openai);
check('first mention rate 1/3', openai.firstMentionRate === 0.3333, openai);
check('average position over answers that name you', openai.averagePosition === 1.5, openai);
check('share of voice = own / tracked mentions', openai.shareOfVoice === 0.4, openai);
check('recommended rate 1/3', openai.recommendedRate === 0.3333, openai);
check('citation rate 1/3', openai.citationRate === 0.3333, openai);
const nova = rollups.get(rollupKey('p1', 'nova'))!;
check('failed answers excluded from denominators', nova.answers === 2 && nova.failed === 1, nova);
check(
  'zero mentions gives null position, not NaN',
  ratesOf(nova).averagePosition === null && ratesOf(nova).mentionRate === 0,
);
const unextracted = computeRollups([answer('p9', 'sonar', [], [], 'answered')], undefined);
check(
  'unextracted answers count as failed',
  unextracted.get(rollupKey('p9', 'sonar'))?.answers === 0 &&
    unextracted.get(rollupKey('p9', 'sonar'))?.failed === 1,
);
check(
  'engine with zero answers has null rates',
  Object.values(ratesOf(unextracted.get(rollupKey('p9', 'sonar'))!)).every((rate) => rate === null),
);
const total = rollups.get(rollupKey(ALL_PROMPTS, ALL_ENGINES))!;
check('workspace rollup counts all answers', total.answers === 6 && total.mentioned === 3, total);
check(
  'per-brand mention counts',
  total.brandMentions.wise === 4 &&
    total.brandMentions.own === 3 &&
    !total.brandMentions['x:monzo'],
  total.brandMentions,
);
check('engine rollup across prompts', rollups.get(rollupKey(ALL_PROMPTS, 'openai'))?.answers === 4);

const summary = summarize(rollups);
check(
  'summary per prompt and engine',
  summary.p1.openai.join() === '2,3' && summary.p1.nova.join() === '0,2' && !summary[ALL_PROMPTS],
  summary,
);
const gaps = findGapCandidates(rollups);
const p1Gap = gaps.find((gap) => gap.promptId === 'p1');
check(
  'missing on nova makes a gap; openai at 1/3 missing does not',
  p1Gap?.missingEngines.join() === 'nova' && p1Gap.neverCited === false,
  gaps,
);
check(
  'never cited makes a gap even when mentioned',
  gaps.find((gap) => gap.promptId === 'p2')?.neverCited === true &&
    gaps.find((gap) => gap.promptId === 'p2')?.missingEngines.length === 0,
  gaps,
);

const diff = diffSummaries(
  { p1: { openai: [0, 3], nova: [2, 3] }, p3: { openai: [1, 3] } },
  { p1: { openai: [2, 3], nova: [0, 3] }, p3: { openai: [0, 0] } },
);
check(
  'diff finds gained and lost, ignores empty runs',
  diff.gained.length === 1 &&
    diff.gained[0].engine === 'openai' &&
    diff.lost.length === 1 &&
    diff.lost[0].engine === 'nova',
  diff,
);
check('first run has empty diff', diffSummaries(undefined, summary).lost.length === 0);

const plan = buildWorkPlan({
  runId: 'r1',
  workspaceId: 'w1',
  startedAt: '2026-11-08T10:00:00.000Z',
  country: 'US',
  prompts: [
    { promptId: 'p1', text: 'one' },
    { promptId: 'p2', text: 'two' },
  ],
  engines: ['openai', 'sonar'],
  samples: 3,
});
check('plan size is prompts x engines x samples', plan.total === 12, plan.total);
check(
  'plan grouped per engine with unique slots',
  plan.work.openai.length === 6 &&
    plan.work.nova.length === 0 &&
    new Set(plan.work.sonar.map((item) => `${item.promptId}#${item.sample}`)).size === 6,
);

check(
  'openai cost counts every search call',
  engineCost('openai', { answers: 1, searchCalls: 3, inputTokens: 0, outputTokens: 0 }) === 0.03,
);
check(
  'nova cost per grounded request plus tokens',
  engineCost('nova', {
    answers: 75,
    searchCalls: 75,
    inputTokens: 1_000_000,
    outputTokens: 100_000,
  }) === 2.8,
);
const records = [
  {
    engine: 'openai',
    status: 'extracted',
    searchCalls: 2,
    usage: { inputTokens: 1000, outputTokens: 100 },
    extractUsage: { inputTokens: 2500, outputTokens: 300 },
    promptId: 'p1',
    mentions: [mention('x:monzo', 1), mention('wise', 2)],
  },
  { engine: 'openai', status: 'failed', searchCalls: 5, promptId: 'p2' },
  {
    engine: 'fake',
    status: 'extracted',
    searchCalls: 0,
    promptId: 'p2',
    mentions: [mention('x:monzo', 1)],
  },
] as unknown as AnswerRecord[];
const cost = costOf(records);
check(
  'run cost skips failed answers',
  cost.engines.openai?.searchCalls === 2 && cost.engines.fake?.dollars === 0,
  cost,
);
check('extraction cost included', cost.extraction > 0 && cost.total > cost.engines.openai!.dollars);
const sightings = untrackedSightings(records);
check(
  'untracked brands counted across prompts',
  sightings.length === 1 &&
    sightings[0].slug === 'monzo' &&
    sightings[0].count === 2 &&
    sightings[0].promptIds.join() === 'p1,p2',
  sightings,
);
finish();
