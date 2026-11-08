import type { TrackedBrand } from '../src/core/matcher.js';
import { mergeExtraction, type ExtractedBrand } from '../src/extraction/merge.js';
import { check, finish, fixture } from './helpers.js';

const RECALL_FLOOR = 0.95;
const POSITION_FLOOR = 0.9;

interface Labelled {
  id: string;
  text: string;
  expected: string[];
}

const { brands, answers } = fixture('labelled/answers.json') as {
  brands: TrackedBrand[];
  answers: Labelled[];
};
const live = process.argv.includes('--live');
const extract = live
  ? (await import('../src/extraction/nova-extractor.js')).extractWithNova
  : undefined;

let expectedTotal = 0;
let found = 0;
let falsePositives = 0;
let orderCorrect = 0;
for (const answer of answers) {
  let llm: ExtractedBrand[] | undefined;
  if (extract) {
    llm = (await extract(answer.text)).brands;
  }
  const tracked = mergeExtraction(answer.text, brands, llm)
    .mentions.filter((mention) => mention.brandId)
    .map((mention) => mention.brandId!);
  expectedTotal += answer.expected.length;
  found += answer.expected.filter((brandId) => tracked.includes(brandId)).length;
  falsePositives += tracked.filter((brandId) => !answer.expected.includes(brandId)).length;
  const ordered = tracked.filter((brandId) => answer.expected.includes(brandId));
  if (ordered.join() === answer.expected.join()) {
    orderCorrect++;
  } else {
    console.log(
      `  order mismatch ${answer.id}: got ${tracked.join()} want ${answer.expected.join()}`,
    );
  }
}
const recall = found / expectedTotal;
const positionAccuracy = orderCorrect / answers.length;
console.log(
  `mode=${live ? 'nova+matcher' : 'matcher'} answers=${answers.length} recall=${recall.toFixed(3)} ` +
    `position=${positionAccuracy.toFixed(3)} falsePositives=${falsePositives}`,
);
check('20 labelled answers', answers.length === 20);
check(`brand recall >= ${RECALL_FLOOR}`, recall >= RECALL_FLOOR, recall);
check(
  `position accuracy >= ${POSITION_FLOOR}`,
  positionAccuracy >= POSITION_FLOOR,
  positionAccuracy,
);
finish();
