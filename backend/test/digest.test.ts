import { buildDigest, type DigestInput } from '../src/digest/build.js';
import type { Run } from '../src/data/runs.js';
import { check, finish } from './helpers.js';

const run = {
  runId: 'r2',
  workspaceId: 'w',
  status: 'complete',
  trigger: 'schedule',
  startedAt: '2026-11-09T06:00:00.000Z',
  engines: ['openai', 'nova'],
  skippedEngines: [],
  samples: 3,
  promptCount: 2,
  plannedCalls: 12,
  answered: 12,
  extracted: 11,
  failed: 1,
  rates: {
    mentionRate: 0.4545,
    firstMentionRate: 0.1,
    averagePosition: 2,
    shareOfVoice: 0.25,
    recommendedRate: 0.1,
    citationRate: 0.09,
  },
  diff: {
    gained: [{ promptId: 'p1', engine: 'openai' }],
    lost: [{ promptId: 'p2', engine: 'nova' }],
  },
  newBrands: ['monzo'],
  gapCandidates: [{ promptId: 'p2', missingEngines: ['nova'], missingRate: 1, neverCited: false }],
  cost: { engines: {}, extraction: 0.01, total: 0.4321 },
} as unknown as Run;
const input: DigestInput = {
  workspaceName: 'Acme <Pay>',
  brandName: 'Acme Pay',
  dashboardUrl: 'https://d1.cloudfront.net/#/w/w',
  run,
  previous: {
    startedAt: '2026-11-02T06:00:00.000Z',
    rates: { ...run.rates!, mentionRate: 0.3333 },
  },
  totals: { mentioned: 5, answers: 11 },
  promptText: (promptId) =>
    ({ p1: 'Best invoicing tool?', p2: 'Cheapest FX?' })[promptId] ?? 'removed',
  engineLabel: (engine) => engine.toUpperCase(),
};
const digest = buildDigest(input);
check(
  'subject has rate and change',
  digest.subject === 'Acme <Pay>: named in 45% of answers (up 12 points)',
  digest.subject,
);
check(
  'headline uses counts',
  digest.text.startsWith('AI answers named Acme Pay in 5 of 11 answers (45%) (up 12 points).'),
  digest.text,
);
check(
  'gained, lost, new brands and gaps listed',
  digest.text.includes('Now named:\n- Best invoicing tool? (OPENAI)') &&
    digest.text.includes('No longer named:\n- Cheapest FX? (NOVA)') &&
    digest.text.includes('- monzo') &&
    digest.text.includes('Gaps (1):\n- Cheapest FX?: missing on NOVA'),
  digest.text,
);
check(
  'cost and failures reported',
  digest.text.includes('11 answers read, 1 failed. Measured cost $0.43.'),
);
check(
  'html escaped',
  !digest.html.includes('<Pay>') && digest.html.includes('href="https://d1.cloudfront.net/#/w/w"'),
);
const first = buildDigest({ ...input, previous: undefined });
check(
  'first run has no change text',
  first.subject === 'Acme <Pay>: named in 45% of answers',
  first.subject,
);
const refused = buildDigest({
  ...input,
  run: { ...run, status: 'refused', refusedReason: '400 calls exceeds the cap of 300' },
});
check(
  'refused run explains why',
  refused.subject.endsWith('run did not complete') &&
    refused.text.includes('400 calls exceeds the cap of 300'),
  refused,
);
finish();
