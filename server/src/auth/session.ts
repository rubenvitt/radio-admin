import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@ra/shared';
import type { SessionClaims } from './types';

const ALG = 'HS256';

const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export async function signSession(
  payload: { sub: string; name: string; role: Role },
  secret: string,
  expiresIn: string = '8h',
): Promise<string> {
  return new SignJWT({ name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(keyOf(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALG] });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.name !== 'string' ||
    (payload.role !== 'admin' && payload.role !== 'updater') ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Invalid session claims');
  }
  return {
    sub: payload.sub,
    name: payload.name,
    role: payload.role,
    exp: payload.exp,
  };
}
