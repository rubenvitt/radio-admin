import { describe, it, expect } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { loadConfig, type AppConfig } from '../src/config';
import { verifyLoanJwt, loanJwtConfigured } from '../src/auth/loan-api-jwt';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const ISS = 'https://issuer.example';
const AUD = 'radio-inventar-client-id';

function cfg(extra: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    SESSION_SECRET: 'test-session-secret-0123456789-abcd',
    OIDC_ISSUER: ISS,
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_REDIRECT_URI: 'https://app.example/callback',
    AUTH_DEV_BYPASS: 'false',
    LOAN_API_EXPECTED_AUDIENCE: AUD,
    ...extra,
  });
}

async function mint(
  privateKey: PrivateKey,
  claims: { iss?: string; aud?: string; sub?: string; exp?: number },
): Promise<string> {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(claims.iss ?? ISS)
    .setAudience(claims.aud ?? AUD)
    .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 3600);
  if (claims.sub) jwt.setSubject(claims.sub);
  return jwt.sign(privateKey);
}

describe('verifyLoanJwt', () => {
  it('loanJwtConfigured is false without an expected audience', () => {
    expect(loanJwtConfigured(cfg({ LOAN_API_EXPECTED_AUDIENCE: undefined }))).toBe(false);
    expect(loanJwtConfigured(cfg())).toBe(true);
  });

  it('accepts a valid token (correct issuer + audience)', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mint(privateKey, {});
    expect(await verifyLoanJwt(token, cfg(), async () => () => publicKey)).toBe(true);
  });

  it('rejects a token with the wrong audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mint(privateKey, { aud: 'someone-else' });
    expect(await verifyLoanJwt(token, cfg(), async () => () => publicKey)).toBe(false);
  });

  it('rejects a token with the wrong issuer', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mint(privateKey, { iss: 'https://evil.example' });
    expect(await verifyLoanJwt(token, cfg(), async () => () => publicKey)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mint(privateKey, { exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyLoanJwt(token, cfg(), async () => () => publicKey)).toBe(false);
  });

  it('rejects a token signed by an unknown key', async () => {
    const signer = await generateKeyPair('RS256');
    const other = await generateKeyPair('RS256');
    const token = await mint(signer.privateKey, {});
    expect(await verifyLoanJwt(token, cfg(), async () => () => other.publicKey)).toBe(false);
  });

  it('returns false when JWT auth is not configured', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mint(privateKey, {});
    expect(
      await verifyLoanJwt(token, cfg({ LOAN_API_EXPECTED_AUDIENCE: undefined }), async () => () => publicKey),
    ).toBe(false);
  });

  it('enforces the expected subject when configured', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const ok = await mint(privateKey, { sub: 'client-radio-inventar' });
    const wrong = await mint(privateKey, { sub: 'client-someone-else' });
    const c = cfg({ LOAN_API_EXPECTED_SUBJECT: 'client-radio-inventar' });
    expect(await verifyLoanJwt(ok, c, async () => () => publicKey)).toBe(true);
    expect(await verifyLoanJwt(wrong, c, async () => () => publicKey)).toBe(false);
  });
});
