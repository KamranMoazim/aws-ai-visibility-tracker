import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { hashId, newId } from '../src/core/ids.js';
import { findBrandTerms } from '../src/core/prompts.js';
import { createEngine } from '../src/engines/index.js';
import { ENGINE_IDS, type EngineId } from '../src/engines/types.js';

const USAGE =
  'usage: npm run run:now -- "<prompt>" [--engines openai,nova,sonar] [--samples 1] ' +
  '[--country US] [--brand Acme --domain acme.com --alias AcmePay] [--dry-run]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    engines: { type: 'string', default: 'openai,nova,sonar' },
    samples: { type: 'string', default: '1' },
    country: { type: 'string' },
    brand: { type: 'string' },
    domain: { type: 'string' },
    alias: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
  },
});

const prompt = positionals.join(' ').trim();
if (!prompt) {
  console.error(USAGE);
  process.exit(1);
}
if (values.brand) {
  const found = findBrandTerms(prompt, {
    name: values.brand,
    domain: values.domain,
    aliases: values.alias,
  });
  if (found.length) {
    console.error(`prompt names the brand (${found.join(', ')}); buyers do not, so rephrase it`);
    process.exit(1);
  }
}

const engineIds = values.engines.split(',').map((engine) => engine.trim()) as EngineId[];
const unknown = engineIds.filter((engine) => !ENGINE_IDS.includes(engine));
if (unknown.length) {
  console.error(`unknown engines: ${unknown.join(', ')}`);
  process.exit(1);
}
const samples = Math.max(1, Math.min(5, Number(values.samples) || 1));

let bucket: string | undefined;
if (!values['dry-run']) {
  try {
    const outputs = JSON.parse(
      readFileSync(new URL('../../infra/cdk-outputs.json', import.meta.url), 'utf8'),
    ).AnswerShareStack;
    process.env.AWS_REGION ??= outputs.Region;
    bucket = outputs.RawBucketName;
  } catch {
    console.error('infra/cdk-outputs.json not found; deploy first or pass --dry-run');
    process.exit(1);
  }
}
const { putJson, rawAnswerKey } = await import('../src/core/storage.js');

const runId = `manual-${newId()}`;
const promptId = hashId(prompt);
console.log(`run=${runId} prompt=${promptId} samples=${samples}`);

let failures = 0;
for (const engineId of engineIds) {
  const engine = await createEngine(engineId);
  if (!engine) {
    console.log(`skip engine=${engineId} reason=no_api_key`);
    continue;
  }
  for (let sample = 0; sample < samples; sample++) {
    const startedAt = Date.now();
    try {
      const answer = await engine.ask(prompt, { country: values.country, sample });
      const key = rawAnswerKey(runId, promptId, engineId, sample);
      if (bucket) {
        await putJson(bucket, key, {
          runId,
          promptId,
          prompt,
          engine: engineId,
          sample,
          country: values.country,
          askedAt: new Date(startedAt).toISOString(),
          answer,
        });
      }
      console.log(
        `ok engine=${engineId} sample=${sample} model=${answer.model} ms=${Date.now() - startedAt} ` +
          `chars=${answer.text.length} citations=${answer.citations.length} ` +
          `searchCalls=${answer.searchCalls} tokensIn=${answer.usage.inputTokens} ` +
          `tokensOut=${answer.usage.outputTokens}${bucket ? ` s3=s3://${bucket}/${key}` : ''}`,
      );
      console.log(`  ${answer.text.slice(0, 240).replace(/\s+/g, ' ')}`);
      for (const citation of answer.citations.slice(0, 5)) {
        console.log(`  - ${citation.url}`);
      }
    } catch (error) {
      failures++;
      console.error(`fail engine=${engineId} sample=${sample} ${(error as Error).message}`);
    }
  }
}
process.exit(failures ? 1 : 0);
