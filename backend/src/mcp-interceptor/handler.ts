import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  clientId: process.env.MCP_CLIENT_ID!,
  tokenUse: 'access',
});

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

interface InterceptorEvent {
  mcp: {
    gatewayRequest: { headers?: Record<string, string>; body?: JsonRpcRequest };
  };
}

function bearerToken(headers: Record<string, string> = {}): string {
  const header = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization');
  return (header?.[1] ?? '').replace(/^Bearer\s+/i, '');
}

function passThrough(body: unknown) {
  return { interceptorOutputVersion: '1.0', mcp: { transformedGatewayRequest: { body } } };
}

function deny(body: JsonRpcRequest | undefined, message: string) {
  return {
    interceptorOutputVersion: '1.0',
    mcp: {
      transformedGatewayResponse: {
        statusCode: 401,
        body: { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32001, message } },
      },
    },
  };
}

/*
 * The Lambda target only receives tool arguments, so the caller's identity rides in
 * a reserved _caller argument. It is always overwritten here from the verified
 * access token, so a client-supplied _caller never reaches mcp-tools.
 */
export async function handler(event: InterceptorEvent) {
  const { headers, body } = event.mcp.gatewayRequest;
  if (body?.method !== 'tools/call') {
    return passThrough(body);
  }
  let claims;
  try {
    claims = await verifier.verify(bearerToken(headers));
  } catch {
    return deny(body, 'Invalid access token');
  }
  return passThrough({
    ...body,
    params: {
      ...body.params,
      arguments: {
        ...(body.params?.arguments ?? {}),
        _caller: { sub: claims.sub, client_id: claims.client_id, scope: claims.scope ?? '' },
      },
    },
  });
}
