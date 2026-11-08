import { fakeEngine } from '../src/engines/fake.js';
import { postJson } from '../src/engines/http.js';
import { parseNovaResponse } from '../src/engines/nova.js';
import { parseOpenAiResponse } from '../src/engines/openai.js';
import { parseSonarResponse } from '../src/engines/sonar.js';
import { EngineError, FATAL_ERROR, RETRYABLE_ERROR } from '../src/engines/types.js';
import { check, finish, fixture } from './helpers.js';

const openai = parseOpenAiResponse(fixture('engines/openai-web-search.json'));
check('openai text', openai.text.startsWith('The easiest options are Wise Business'), openai.text);
check('openai counts every web_search_call', openai.searchCalls === 2, openai.searchCalls);
check(
  'openai citations deduped without utm',
  openai.citations.length === 2 &&
    openai.citations[0].url === 'https://wise.com/us/business/invoicing',
  openai.citations,
);
check('openai keeps titles', openai.citations[0].title === 'Wise Business invoicing');
check(
  'openai usage and model',
  openai.usage.inputTokens === 8123 &&
    openai.usage.outputTokens === 412 &&
    openai.model === 'gpt-5-mini-2025-08-07',
  openai,
);
check(
  'openai empty response',
  parseOpenAiResponse({}).text === '' && parseOpenAiResponse({}).searchCalls === 0,
);

const sonar = parseSonarResponse(fixture('engines/sonar.json'));
check('sonar text', sonar.text.startsWith('Payoneer and Wise'), sonar.text);
check(
  'sonar prefers search_results with titles',
  sonar.citations.length === 2 &&
    sonar.citations[0].title === 'Best International Payment Services',
  sonar.citations,
);
check('sonar bills one search per request', sonar.searchCalls === 1);
check('sonar usage', sonar.usage.inputTokens === 14 && sonar.usage.outputTokens === 230);
const sonarFallback = parseSonarResponse(fixture('engines/sonar-citations-only.json'));
check(
  'sonar falls back to citations and drops non-urls',
  sonarFallback.citations.length === 1 &&
    sonarFallback.citations[0].url === 'https://stripe.com/invoicing',
  sonarFallback.citations,
);

const nova = parseNovaResponse(fixture('engines/nova-grounded.json'));
check(
  'nova joins text and cited text in order',
  nova.text ===
    'Wise Business is a popular choice for international invoicing, with multi-currency accounts. Payoneer is another option.',
  nova.text,
);
check(
  'nova web citations',
  nova.citations.length === 2 &&
    nova.citations[0].url === 'https://wise.com/us/business/' &&
    nova.citations[0].title === 'Wise Business',
  nova.citations,
);
check('nova usage', nova.usage.inputTokens === 1520 && nova.usage.outputTokens === 96);
const novaArray = parseNovaResponse(fixture('engines/nova-grounded-array.json'));
check(
  'nova accepts the documented array shape',
  novaArray.text === 'Recent options include Payoneer.' &&
    novaArray.citations[0]?.url === 'https://www.payoneer.com/',
  novaArray,
);

const real = parseNovaResponse(fixture('engines/nova-grounded-real.json'));
check(
  'real nova response: text joined, tool blocks ignored',
  real.text.startsWith('The easiest way to invoice international clients') &&
    !real.text.includes('[HIDDEN]'),
  real.text.slice(0, 120),
);
check(
  'real nova response: citations from separate blocks, deduped',
  real.citations.length === 5 &&
    real.citations.every((citation) => citation.url.startsWith('https://')),
  real.citations,
);
check('real nova response: one grounding search counted', real.searchCalls === 1, real.searchCalls);
check('synthetic nova response without tool blocks counts no searches', nova.searchCalls === 0);

const engine = fakeEngine();
const first = await engine.ask('same prompt', { sample: 0 });
const again = await engine.ask('same prompt', { sample: 0 });
const next = await engine.ask('same prompt', { sample: 1 });
check('fake is deterministic per sample', first.text === again.text);
check('fake varies across samples', first.text !== next.text);
check('fake costs nothing', first.searchCalls === 0 && first.citations.length > 0);

const realFetch = globalThis.fetch;
async function failureFor(status: number | 'network'): Promise<EngineError | undefined> {
  globalThis.fetch = (async () => {
    if (status === 'network') {
      throw new TypeError('fetch failed');
    }
    return new Response('{"error":"x"}', { status });
  }) as typeof fetch;
  try {
    await postJson('openai', 'https://example.invalid', 'key', {});
    return undefined;
  } catch (error) {
    return error as EngineError;
  } finally {
    globalThis.fetch = realFetch;
  }
}
const throttled = await failureFor(429);
check(
  '429 is retryable',
  throttled?.retryable === true && throttled.name === RETRYABLE_ERROR && throttled.status === 429,
  throttled,
);
const unavailable = await failureFor(503);
check('5xx is retryable', unavailable?.retryable === true, unavailable);
const badRequest = await failureFor(400);
check(
  '4xx is fatal',
  badRequest?.retryable === false && badRequest.name === FATAL_ERROR,
  badRequest,
);
const unauthorized = await failureFor(401);
check('401 is fatal', unauthorized?.retryable === false, unauthorized);
const network = await failureFor('network');
check('network failure is retryable', network?.retryable === true, network);
finish();
