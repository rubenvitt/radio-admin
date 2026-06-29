import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { createApiToken } from '../src/repos/apiTokenRepo';
import type { LoanRecord, ActiveLoan, LoanHistoryResponse } from '@ra/shared';

/** Build an app + a valid S2S bearer header in one step. */
function setup() {
  const { db } = makeTestDb();
  const app = buildTestApp(db);
  const { secret } = createApiToken(db, 'svc', null);
  const auth = { Authorization: `Bearer ${secret}` };
  return { db, app, auth };
}

function loanableDevice(db: ReturnType<typeof makeTestDb>['db'], over = {}) {
  return createDevice(
    db,
    { issi: '100', rufname: 'Florian 4-23', serialNumber: 'SN-1', deviceType: 'HRT', loanable: true, status: 'Einsatzbereit', ...over },
    null,
  );
}

describe('POST /api/v1/loans', () => {
  it('401 without a token', async () => {
    const { app } = setup();
    const res = await app.request('/api/v1/loans', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('400 on an invalid body', async () => {
    const { app, auth } = setup();
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ borrowerName: 'Max' }), // no deviceId
    });
    expect(res.status).toBe(400);
  });

  it('404 when the device does not exist', async () => {
    const { app, auth } = setup();
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ deviceId: 'nope', borrowerName: 'Max' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'device_not_found' });
  });

  it('409 when the device is not loanable', async () => {
    const { db, app, auth } = setup();
    const dev = loanableDevice(db, { loanable: false });
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ deviceId: dev.id, borrowerName: 'Max' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'device_not_loanable' });
  });

  it('409 when the device condition is defect or maintenance', async () => {
    const { db, app, auth } = setup();
    const defect = loanableDevice(db, { issi: '101', status: 'Defekt' });
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ deviceId: defect.id, borrowerName: 'Max' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'device_not_available', condition: 'DEFECT' });
  });

  it('201 creates a loan with a server-side snapshot', async () => {
    const { db, app, auth } = setup();
    const dev = loanableDevice(db);
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ deviceId: dev.id, borrowerName: '  Max  ' }),
    });
    expect(res.status).toBe(201);
    const loan = (await res.json()) as LoanRecord;
    expect(loan.deviceId).toBe(dev.id);
    expect(loan.borrowerName).toBe('Max');
    expect(loan.snapshotCallSign).toBe('Florian 4-23');
    expect(loan.snapshotSerialNumber).toBe('SN-1');
    expect(loan.snapshotDeviceType).toBe('HRT');
    expect(loan.returnedAt).toBeNull();
    expect(typeof loan.borrowedAt).toBe('number');
  });

  it('409 device_already_on_loan on a second active loan for the same device', async () => {
    const { db, app, auth } = setup();
    const dev = loanableDevice(db);
    const body = JSON.stringify({ deviceId: dev.id, borrowerName: 'Max' });
    const first = await app.request('/api/v1/loans', { method: 'POST', headers: auth, body });
    expect(first.status).toBe(201);
    const second = await app.request('/api/v1/loans', { method: 'POST', headers: auth, body });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'device_already_on_loan' });
  });
});

describe('PATCH /api/v1/loans/:loanId', () => {
  async function borrow(app: ReturnType<typeof buildTestApp>, auth: Record<string, string>, deviceId: string) {
    const res = await app.request('/api/v1/loans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ deviceId, borrowerName: 'Max' }),
    });
    return (await res.json()) as LoanRecord;
  }

  it('200 returns the loan with a note and a returnedAt', async () => {
    const { db, app, auth } = setup();
    const dev = loanableDevice(db);
    const loan = await borrow(app, auth, dev.id);
    const res = await app.request(`/api/v1/loans/${loan.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ returnNote: '  Display kaputt ' }),
    });
    expect(res.status).toBe(200);
    const returned = (await res.json()) as LoanRecord;
    expect(returned.returnedAt).toBeGreaterThan(0);
    expect(returned.returnNote).toBe('Display kaputt');
  });

  it('404 for an unknown loan, 409 for an already-returned one', async () => {
    const { db, app, auth } = setup();
    const dev = loanableDevice(db);
    const loan = await borrow(app, auth, dev.id);

    const missing = await app.request('/api/v1/loans/nope', { method: 'PATCH', headers: auth, body: '{}' });
    expect(missing.status).toBe(404);

    const ok = await app.request(`/api/v1/loans/${loan.id}`, { method: 'PATCH', headers: auth, body: '{}' });
    expect(ok.status).toBe(200);
    const again = await app.request(`/api/v1/loans/${loan.id}`, { method: 'PATCH', headers: auth, body: '{}' });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'loan_already_returned' });
  });
});

describe('GET /api/v1/active-loans', () => {
  it('returns the active-loan projection and excludes returned loans', async () => {
    const { db, app, auth } = setup();
    const a = loanableDevice(db, { issi: '100' });
    const b = loanableDevice(db, { issi: '200' });
    const resA = await app.request('/api/v1/loans', { method: 'POST', headers: auth, body: JSON.stringify({ deviceId: a.id, borrowerName: 'A' }) });
    const loanA = (await resA.json()) as LoanRecord;
    const resB = await app.request('/api/v1/loans', { method: 'POST', headers: auth, body: JSON.stringify({ deviceId: b.id, borrowerName: 'B' }) });
    const loanB = (await resB.json()) as LoanRecord;
    await app.request(`/api/v1/loans/${loanB.id}`, { method: 'PATCH', headers: auth, body: '{}' });

    const res = await app.request('/api/v1/active-loans', { headers: auth });
    expect(res.status).toBe(200);
    const active = (await res.json()) as ActiveLoan[];
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(loanA.id);
    expect(Object.keys(active[0] ?? {}).sort()).toEqual(
      ['borrowedAt', 'borrowerName', 'deviceId', 'id', 'snapshotCallSign', 'snapshotDeviceType'].sort(),
    );
  });
});

describe('GET /api/v1/loans/history', () => {
  it('returns a paginated envelope and filters by device', async () => {
    const { db, app, auth } = setup();
    const a = loanableDevice(db, { issi: '100' });
    const b = loanableDevice(db, { issi: '200' });
    for (const dev of [a, b]) {
      await app.request('/api/v1/loans', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ deviceId: dev.id, borrowerName: 'X' }),
      });
    }

    const all = await app.request('/api/v1/loans/history?page=1&pageSize=10', { headers: auth });
    expect(all.status).toBe(200);
    const body = (await all.json()) as LoanHistoryResponse;
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.rows).toHaveLength(2);

    const filtered = await app.request(`/api/v1/loans/history?deviceId=${a.id}`, { headers: auth });
    const filteredBody = (await filtered.json()) as LoanHistoryResponse;
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.rows[0]?.deviceId).toBe(a.id);
  });
});
