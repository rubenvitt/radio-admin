import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { AppConfig } from '../config';

/**
 * Service-to-service auth for the public loan API via an OIDC bearer JWT
 * (Pocket ID client_credentials). Enabled only when both an issuer and the
 * expected audience are configured; otherwise the loan API stays on its
 * api-token guard alone.
 */
export function loanJwtConfigured(cfg: AppConfig): boolean {
  return Boolean(cfg.OIDC_ISSUER && cfg.LOAN_API_EXPECTED_AUDIENCE);
}

/**
 * Resolves the JWKS key-getter for an issuer. This is the network boundary
 * (OIDC discovery + remote JWKS); it is injected in tests so the issuer/
 * audience/subject checks can be exercised with locally generated keys.
 */
export type LoanJwtKeyResolver = (issuer: string) => Promise<JWTVerifyGetKey>;

// Per-issuer cache of the remote JWKS getter. jose caches the fetched keys
// internally; we only memoize the discovery + getter creation.
const jwksByIssuer = new Map<string, Promise<JWTVerifyGetKey>>();

const defaultKeyResolver: LoanJwtKeyResolver = (issuer) => {
  let cached = jwksByIssuer.get(issuer);
  if (!cached) {
    cached = (async () => {
      const base = issuer.endsWith('/') ? issuer : `${issuer}/`;
      const res = await fetch(new URL('.well-known/openid-configuration', base), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
      const doc: unknown = await res.json();
      const jwksUri =
        typeof doc === 'object' && doc !== null && 'jwks_uri' in doc
          ? (doc as { jwks_uri: unknown }).jwks_uri
          : undefined;
      if (typeof jwksUri !== 'string') throw new Error('OIDC discovery missing jwks_uri');
      return createRemoteJWKSet(new URL(jwksUri));
    })().catch((err) => {
      jwksByIssuer.delete(issuer);
      throw err;
    });
    jwksByIssuer.set(issuer, cached);
  }
  return cached;
};

/**
 * Verify a bearer token as a loan-API service credential. Returns true only on
 * a valid signature with the expected issuer + audience (and subject, when
 * configured). Never throws — any failure resolves to false so the caller can
 * fall through to the api-token check / 401.
 */
export async function verifyLoanJwt(
  token: string,
  cfg: AppConfig,
  resolveKey: LoanJwtKeyResolver = defaultKeyResolver,
): Promise<boolean> {
  if (!loanJwtConfigured(cfg)) return false;
  try {
    const getKey = await resolveKey(cfg.OIDC_ISSUER as string);
    const { payload } = await jwtVerify(token, getKey, {
      issuer: cfg.OIDC_ISSUER,
      audience: cfg.LOAN_API_EXPECTED_AUDIENCE,
    });
    if (cfg.LOAN_API_EXPECTED_SUBJECT && payload.sub !== cfg.LOAN_API_EXPECTED_SUBJECT) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
