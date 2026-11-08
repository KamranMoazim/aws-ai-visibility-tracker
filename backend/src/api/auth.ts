import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { MiddlewareHandler } from 'hono';
import type { LambdaEvent } from 'hono/aws-lambda';
import { HttpError } from '../core/http-error.js';

export type AppEnv = {
  Bindings: { event?: LambdaEvent };
  Variables: { userId: string };
};

type JwtClaims = Record<string, string | number | undefined>;

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function localVerifier() {
  verifier ??= CognitoJwtVerifier.create({
    userPoolId: process.env.USER_POOL_ID!,
    clientId: process.env.USER_POOL_CLIENT_ID!,
    tokenUse: 'id',
  });
  return verifier;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (context, next) => {
  const event = context.env?.event as
    | { requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } } }
    | undefined;
  let subject = event?.requestContext?.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!subject && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const token = context.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        subject = (await localVerifier().verify(token)).sub;
      } catch {
        subject = undefined;
      }
    }
  }
  if (!subject) {
    throw new HttpError(401, 'unauthenticated', 'Sign in first');
  }
  context.set('userId', subject);
  await next();
};
