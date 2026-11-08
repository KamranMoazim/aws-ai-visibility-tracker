import { EngineError, type EngineId } from './types.js';

const REQUEST_TIMEOUT_MS = 120_000;

export const isRetryableStatus = (status: number) => status === 429 || status >= 500;

export async function postJson(
  engine: EngineId,
  url: string,
  apiKey: string,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new EngineError(engine, undefined, true, `request failed: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new EngineError(
      engine,
      response.status,
      isRetryableStatus(response.status),
      `HTTP ${response.status} ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new EngineError(engine, response.status, true, 'response was not JSON');
  }
}
