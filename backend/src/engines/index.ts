import { getSecret, OPENAI_KEY_PARAMETER, PERPLEXITY_KEY_PARAMETER } from '../core/ssm.js';
import { fakeEngine } from './fake.js';
import { novaEngine } from './nova.js';
import { openAiEngine } from './openai.js';
import { sonarEngine } from './sonar.js';
import type { AnswerEngine, EngineId } from './types.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

export async function createEngine(id: EngineId): Promise<AnswerEngine | undefined> {
  switch (id) {
    case 'openai': {
      const apiKey = await getSecret(OPENAI_KEY_PARAMETER);
      return apiKey
        ? openAiEngine(apiKey, process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL)
        : undefined;
    }
    case 'sonar': {
      const apiKey = await getSecret(PERPLEXITY_KEY_PARAMETER);
      return apiKey ? sonarEngine(apiKey) : undefined;
    }
    case 'nova':
      return novaEngine();
    case 'fake':
      return fakeEngine();
  }
}
