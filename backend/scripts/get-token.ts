import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { loadOutputs } from './outputs.js';

const MCP_CALLBACK_URL = 'http://localhost:8976/callback';

const { values } = parseArgs({ options: { draft: { type: 'boolean', default: false } } });
const outputs = loadOutputs();
const scopes = ['answershare/read', ...(values.draft ? ['answershare/draft'] : [])];
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(16).toString('hex');
const authorizeUrl = `${outputs.CognitoDomain}/oauth2/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: outputs.McpClientId,
  redirect_uri: MCP_CALLBACK_URL,
  scope: scopes.join(' '),
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
  state,
})}`;

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', MCP_CALLBACK_URL);
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    const received = url.searchParams.get('code');
    const ok = received && url.searchParams.get('state') === state;
    response
      .writeHead(ok ? 200 : 400, { 'content-type': 'text/plain' })
      .end(ok ? 'Signed in. You can close this tab.' : 'Sign-in failed.');
    server.close();
    if (ok) {
      resolve(received);
    } else {
      reject(new Error(url.searchParams.get('error_description') ?? 'state mismatch'));
    }
  });
  server.listen(8976, '127.0.0.1', () => {
    console.error(`Opening the sign-in page; if it does not open, visit:\n${authorizeUrl}\n`);
    execFile('open', [authorizeUrl], () => undefined);
  });
});

const response = await fetch(`${outputs.CognitoDomain}/oauth2/token`, {
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
const tokens = await response.json();
if (!tokens.access_token) {
  throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);
}
console.error(`Scopes: ${scopes.join(' ')}; expires in ${tokens.expires_in} seconds.\n`);
console.error('Add it to Claude Code with:');
console.error(
  `claude mcp add --transport http answershare ${outputs.GatewayUrl} --header "Authorization: Bearer $TOKEN"\n`,
);
console.log(tokens.access_token);
