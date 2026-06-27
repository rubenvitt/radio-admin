import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { generateKeyPair, SignJWT } from 'jose';
import { makeTestDb } from '../src/db/test-utils';
import { loadConfig } from '../src/config';
import { loanApiRoutes } from '../src/routes/loanApi';
import { createDevice } from '../src/repos/deviceRepo';
import { createApiToken } from '../src/repos/apiTokenRepo';

const PATH = '/api/v1/loan-devices';
const ISS = 'https://issuer.example';
const AUD = 'radio-inventar';

function cfg() {
  return loadConfig({
    SESSION_SECRET: 'test-session-secret-0123456789-abcd',
    OIDC_ISSUER: ISS,
    OIDC_CLIENT_ID: 'c',
    OIDC_CLIENT_SECRET: 's',
    OIDC_REDIRECT_URI: 'https://app.example/cb',
    AUTH_DEV_BYPASS: 'false',
    LOAN_API_EXPECTED_AUDIENCE: AUD,
  });
}

async function mintToken(privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime('1h')
    .sign(privateKey);
}

describe('loan API auth: JWT + api-token', () => {
  it('accepts a valid OIDC bearer JWT', async () => {
    const { db } = makeTestDb();
    createDevice(db, { issi: '100', loanable: true }, null);
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await mintToken(privateKey);
    const app = new Hono();
    app.route('/api', loanApiRoutes(db, cfg(), async () => () => publicKey));

    const res = await app.request(PATH, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it('rejects an invalid JWT with no api-token (401)', async () => {
    const { db } = makeTestDb();
    const { publicKey } = await generateKeyPair('RS256');
    const app = new Hono();
    app.route('/api', loanApiRoutes(db, cfg(), async () => () => publicKey));

    const res = await app.request(PATH, { headers: { Authorization: 'Bearer not-a-jwt' } });
    expect(res.status).toBe(401);
  });

  it('still accepts a valid api-token even when JWT auth is configured', async () => {
    const { db } = makeTestDb();
    createDevice(db, { issi: '100', loanable: true }, null);
    const { secret } = createApiToken(db, 'svc', null);
    const { publicKey } = await generateKeyPair('RS256');
    const app = new Hono();
    app.route('/api', loanApiRoutes(db, cfg(), async () => () => publicKey));

    const res = await app.request(PATH, { headers: { Authorization: `Bearer ${secret}` } });
    expect(res.status).toBe(200);
  });
});
