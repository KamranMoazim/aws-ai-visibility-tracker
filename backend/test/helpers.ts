import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadOutputs } from '../scripts/outputs.js';

export { loadOutputs };

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/${path}`, import.meta.url), 'utf8'));
}

let passed = 0;
let failed = 0;

export function check(name: string, ok: boolean, extra?: unknown): void {
  if (ok) {
    passed++;
  } else {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(extra)}`);
}

export function finish(): never {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

export async function deletePartitions(
  region: string,
  tableName: string,
  partitionKeys: string[],
): Promise<void> {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } = await import(
    '@aws-sdk/lib-dynamodb'
  );
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  for (const partitionKey of partitionKeys) {
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await documentClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': partitionKey },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: startKey,
        }),
      );
      const items = page.Items ?? [];
      for (let start = 0; start < items.length; start += 25) {
        await documentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tableName]: items.slice(start, start + 25).map((item) => ({
                DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
              })),
            },
          }),
        );
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
  }
}

export const MCP_CALLBACK_URL = 'http://localhost:8976/callback';

function cookieJar() {
  const cookies = new Map<string, string>();
  return {
    store(response: Response) {
      for (const setCookie of response.headers.getSetCookie()) {
        const [pair] = setCookie.split(';');
        const separator = pair.indexOf('=');
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    },
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

/*
 * Drives Cognito's hosted login form the way a browser would: authorize, read the
 * CSRF token from the login page, post the credentials, then trade the code for
 * tokens with the PKCE verifier. Only test users with known passwords use this.
 */
export async function mcpAccessToken(
  email: string,
  password: string,
  scopes: string[],
): Promise<string> {
  const outputs = loadOutputs();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: outputs.McpClientId,
    redirect_uri: MCP_CALLBACK_URL,
    scope: scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: randomBytes(8).toString('hex'),
  });
  const jar = cookieJar();
  const authorize = await fetch(`${outputs.CognitoDomain}/oauth2/authorize?${query}`, {
    redirect: 'manual',
  });
  jar.store(authorize);
  const loginUrl = new URL(authorize.headers.get('location')!, outputs.CognitoDomain);
  const loginPage = await fetch(loginUrl, { headers: { cookie: jar.header() } });
  jar.store(loginPage);
  const csrf = (await loginPage.text()).match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf) {
    throw new Error('login form not found on the hosted UI');
  }
  const submitted = await fetch(loginUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header() },
    body: new URLSearchParams({ _csrf: csrf, username: email, password }),
  });
  const code = new URL(submitted.headers.get('location') ?? '', MCP_CALLBACK_URL).searchParams.get(
    'code',
  );
  if (!code) {
    throw new Error(`login did not return a code (status ${submitted.status})`);
  }
  const tokens = await fetch(`${outputs.CognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: outputs.McpClientId,
      code,
      redirect_uri: MCP_CALLBACK_URL,
      code_verifier: verifier,
    }),
  });
  const body = await tokens.json();
  if (!body.access_token) {
    throw new Error(`token exchange failed: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

export async function mcpCall(
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; headers: Headers; body: any }> {
  const response = await fetch(loadOutputs().GatewayUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomBytes(4).toString('hex'), method, params }),
  });
  const text = await response.text();
  const json = text.trim().startsWith('{')
    ? text
    : (text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop() ?? '');
  let body: any = text;
  try {
    body = JSON.parse(json);
  } catch {
    body = text;
  }
  return { status: response.status, headers: response.headers, body };
}

export function toolResult(response: { body: any }): any {
  const content = response.body?.result?.content?.[0]?.text;
  try {
    return JSON.parse(content);
  } catch {
    return response.body;
  }
}
