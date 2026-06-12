import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { createApiToken, revokeApiToken, listApiTokens } from '../src/repos/apiTokenRepo';
import type { LoanDevice } from '../src/routes/loanApi';

const PATH = '/api/v1/loan-devices';

describe('public loan API', () => {
  it('401 without any token', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request(PATH);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('401 with a garbage or revoked token', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const garbage = await app.request(PATH, {
      headers: { Authorization: 'Bearer ra_notarealtoken' },
    });
    expect(garbage.status).toBe(401);

    const { record, secret } = createApiToken(db, 'svc', null);
    expect(revokeApiToken(db, record.id)).toBe(true);
    const revoked = await app.request(PATH, { headers: { Authorization: `Bearer ${secret}` } });
    expect(revoked.status).toBe(401);
  });

  it('200 + only loanable devices with a valid Bearer token; stamps lastUsedAt', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    createDevice(db, { issi: '100', rufname: 'Leihgerät', opta: 'O-1', loanable: true }, null);
    createDevice(db, { issi: '200', rufname: 'Nicht leihbar', loanable: false }, null);
    createDevice(db, { issi: '300', rufname: 'Unbekannt', loanable: null }, null);
    const { record, secret } = createApiToken(db, 'svc', null);

    const res = await app.request(PATH, { headers: { Authorization: `Bearer ${secret}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoanDevice[];
    expect(body).toHaveLength(1);
    expect(body[0]?.issi).toBe('100');
    expect(body[0]?.opta).toBe('O-1');
    expect(body[0]?.rufname).toBe('Leihgerät');
    // PUBLIC subset only — no internal/audit fields leak.
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(
      ['bedieneinheit', 'deviceType', 'funktion', 'hersteller', 'issi', 'location', 'opta', 'rufname', 'status'].sort(),
    );
    for (const k of ['id', 'createdAt', 'updatedBy', 'softwareVersion', 'serialNumber', 'loanable', 'notes']) {
      expect(body[0]).not.toHaveProperty(k);
    }

    // lastUsedAt was stamped on the verified token.
    const tok = listApiTokens(db).find((t) => t.id === record.id);
    expect(tok?.lastUsedAt).not.toBeNull();
  });

  it('also accepts X-API-Key header', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    createDevice(db, { issi: '100', loanable: true }, null);
    const { secret } = createApiToken(db, 'svc', null);
    const res = await app.request(PATH, { headers: { 'X-API-Key': secret } });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});
