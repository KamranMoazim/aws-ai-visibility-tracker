import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export const OPENAI_KEY_PARAMETER = '/answershare/openai-api-key';
export const PERPLEXITY_KEY_PARAMETER = '/answershare/perplexity-api-key';

const ssmClient = new SSMClient({});
const cache = new Map<string, Promise<string | undefined>>();

async function fetchSecret(name: string): Promise<string | undefined> {
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    return response.Parameter?.Value || undefined;
  } catch (error) {
    if ((error as Error).name === 'ParameterNotFound') {
      return undefined;
    }
    throw error;
  }
}

export function getSecret(name: string): Promise<string | undefined> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetchSecret(name);
    cache.set(name, pending);
    pending.catch(() => cache.delete(name));
  }
  return pending;
}
