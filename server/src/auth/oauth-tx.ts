import { SignJWT, jwtVerify } from 'jose';
import type { OauthTx } from './types';

const ALG = 'HS256';
const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export const OAUTH_TX_COOKIE = 'oauth_tx';
export const SESSION_COOKIE = 'ra_session';

export async function signOauthTx(
  tx: OauthTx,
  secret: string,
  expiresIn: string = '10m',
): Promise<string> {
  return new SignJWT({ ...tx })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(keyOf(secret));
}

export async function verifyOauthTx(token: string, secret: string): Promise<OauthTx> {
  const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALG] });
  if (
    typeof payload.state !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.code_verifier !== 'string'
  ) {
    throw new Error('Invalid oauth_tx payload');
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    code_verifier: payload.code_verifier,
  };
}
