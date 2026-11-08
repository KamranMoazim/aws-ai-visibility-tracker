import {
  answerIndexSk,
  answerSk,
  gapIndexPk,
  linkPrefix,
  linkSk,
  metricPrefix,
  metricSk,
  promptIndexPk,
  runPk,
  runSk,
  scoreSk,
  workspaceMetricsPk,
  workspacePk,
} from '../src/core/keys.js';
import { hashId, slugify } from '../src/core/ids.js';
import { rawAnswerKey } from '../src/core/storage.js';
import { check, finish } from './helpers.js';

const iso = '2026-11-08T10:00:00.000Z';
check('workspace pk', workspacePk('w1') === 'WS#w1');
check('run sk sorts by time', runSk(iso, 'r1') === `RUN#${iso}#r1`);
check('run pk', runPk('r1') === 'RUN#r1');
check('answer sk is deterministic', answerSk('p1', 'openai', 2) === 'ANS#p1#openai#2');
check('answer index', promptIndexPk('p1') === 'PROMPT#p1');
check('answer index sk', answerIndexSk(iso, 'nova', 0) === `${iso}#nova#0`);
check(
  'metric sk starts with its prefix',
  metricSk('p1', 'sonar', iso).startsWith(metricPrefix('p1', 'sonar')),
);
check(
  'metric prefix does not match a longer engine name',
  !metricSk('p1', 'openai2', iso).startsWith(metricPrefix('p1', 'openai')),
);
check('workspace metrics index', workspaceMetricsPk('w1') === 'WS#w1#MET');
check('gap index by status', gapIndexPk('w1', 'open') === 'WS#w1#GAP#open');
check(
  'score sk sorts numerically as a string',
  scoreSk(2.5) < scoreSk(10) && scoreSk(0.25) < scoreSk(2.5),
  [scoreSk(0.25), scoreSk(2.5), scoreSk(10)],
);
check('link sk under prompt prefix', linkSk('p1', 'post1').startsWith(linkPrefix('p1')));
check('raw answer key layout', rawAnswerKey('r1', 'p1', 'openai', 0) === 'raw/r1/p1/openai/0.json');
check(
  'hash id is stable and short',
  hashId('abc') === hashId('abc') && hashId('abc').length === 16,
);
check(
  'slugify',
  slugify('Wise Business (UK)') === 'wise-business-uk',
  slugify('Wise Business (UK)'),
);
finish();
