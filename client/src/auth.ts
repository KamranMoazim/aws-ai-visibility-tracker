import { loadConfig } from './config';
import { readStored, writeStored } from './storage';

const SESSION_KEY = 'answershare.session';

export interface Session {
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let session: Session | null = readStored<Session>(SESSION_KEY);

async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const { region, userPoolClientId } = await loadConfig();
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify({ ClientId: userPoolClientId, ...body }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload.__type ?? 'Unknown')
      .split('#')
      .pop()!;
    throw new AuthError(code, payload.message ?? 'Request failed');
  }
  return payload as T;
}

interface AuthResult {
  AuthenticationResult: { IdToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
}

function store(next: Session | null): void {
  session = next;
  writeStored(SESSION_KEY, next);
}

export function currentSession(): Session | null {
  return session;
}

export async function signIn(email: string, password: string): Promise<Session> {
  const result = await cognito<AuthResult>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (!result.AuthenticationResult) {
    throw new AuthError(
      result.ChallengeName ?? 'challenge',
      'This account needs a new password. Run npm run add-user again to set one.',
    );
  }
  const next: Session = {
    email,
    idToken: result.AuthenticationResult.IdToken,
    refreshToken: result.AuthenticationResult.RefreshToken!,
    expiresAt: Date.now() + result.AuthenticationResult.ExpiresIn * 1000,
  };
  store(next);
  return next;
}

export function signOut(): void {
  store(null);
}

export async function getIdToken(): Promise<string | null> {
  if (!session) {
    return null;
  }
  if (session.expiresAt - Date.now() > 60_000) {
    return session.idToken;
  }
  try {
    const result = await cognito<AuthResult>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: session.refreshToken },
    });
    store({
      ...session,
      idToken: result.AuthenticationResult.IdToken,
      expiresAt: Date.now() + result.AuthenticationResult.ExpiresIn * 1000,
    });
    return session!.idToken;
  } catch {
    store(null);
    return null;
  }
}
