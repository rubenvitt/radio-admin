import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { Db } from '../repos/deviceRepo';
import { listLoanableDevices, getDeviceById } from '../repos/deviceRepo';
import { verifyApiToken } from '../repos/apiTokenRepo';
import { verifyLoanJwt, type LoanJwtKeyResolver } from '../auth/loan-api-jwt';
import {
  createLoan,
  returnLoan,
  findActiveLoans,
  listLoans,
  LoanConflictError,
} from '../repos/loanRepo';
import type { AppConfig } from '../config';
import {
  createLoanSchema,
  returnLoanSchema,
  loanHistoryParamsSchema,
  mapDeviceCondition,
  type DeviceRecord,
  type ActiveLoan,
  type LoanRecord,
} from '@ra/shared';

/**
 * PUBLIC loan-device view: a deliberate subset, no audit/software fields.
 * `id` (the immutable cuid2 primary key) and `serialNumber` are exposed so
 * service consumers (radio-inventar) can key loans on the stable id — issi is
 * mutable (a device can be reprogrammed) and unsuitable as a foreign key.
 */
export interface LoanDevice {
  id: string;
  issi: string;
  opta: string | null;
  rufname: string | null;
  status: string | null;
  location: string | null;
  deviceType: string | null;
  serialNumber: string | null;
  hersteller: string | null;
  bedieneinheit: string | null;
  funktion: string | null;
}

function toLoanDevice(d: DeviceRecord): LoanDevice {
  return {
    id: d.id,
    issi: d.issi,
    opta: d.opta,
    rufname: d.rufname,
    status: d.status,
    location: d.location,
    deviceType: d.deviceType,
    serialNumber: d.serialNumber,
    hersteller: d.hersteller,
    bedieneinheit: d.bedieneinheit,
    funktion: d.funktion,
  };
}

/**
 * Read the bearer/API-key token from the request: `Authorization: Bearer <t>`
 * or `X-API-Key: <t>`. Returns the raw secret or null.
 */
function extractToken(authHeader: string | undefined, apiKeyHeader: string | undefined): string | null {
  if (authHeader) {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m?.[1]) return m[1].trim();
  }
  if (apiKeyHeader && apiKeyHeader.trim() !== '') return apiKeyHeader.trim();
  return null;
}

/**
 * Auth guard for the public loan API: 401 unless the request carries either a
 * valid API token (verified locally) or a valid OIDC bearer JWT (Pocket ID
 * client_credentials, verified by signature/issuer/audience). The api-token
 * check runs first because it is cheap and local; the JWT path only runs when
 * configured (issuer + expected audience) and otherwise short-circuits to false.
 */
function requireLoanApiAuth(
  db: Db,
  cfg: AppConfig,
  resolveKey?: LoanJwtKeyResolver,
): MiddlewareHandler {
  return async (c, next) => {
    const token = extractToken(c.req.header('Authorization'), c.req.header('X-API-Key'));
    if (!token) return c.json({ error: 'unauthorized' }, 401);
    if (verifyApiToken(db, token)) return next();
    if (await verifyLoanJwt(token, cfg, resolveKey)) return next();
    return c.json({ error: 'unauthorized' }, 401);
  };
}

/** Active-loan projection for the S2S consumer (radio-inventar device overlay + dashboard). */
function toActiveLoan(loan: LoanRecord): ActiveLoan {
  return {
    id: loan.id,
    deviceId: loan.deviceId,
    snapshotCallSign: loan.snapshotCallSign,
    snapshotDeviceType: loan.snapshotDeviceType,
    borrowerName: loan.borrowerName,
    borrowedAt: loan.borrowedAt,
  };
}

/**
 * Public, token-authed loan API. MOUNTED BEFORE the `/api/*` session guard in
 * buildApp, so it is reachable without a browser session — service callers
 * authenticate with an API token or an OIDC client_credentials JWT instead.
 *
 * Besides the read-only loanable device list, it owns the loan write surface
 * (create / return) that the radio-inventar kiosk calls through to, plus the
 * active-loans and history reads radio-inventar uses for status + history.
 *
 * `resolveKey` is an optional JWKS resolver seam for tests; production uses the
 * built-in remote resolver (OIDC discovery + JWKS) in loan-api-jwt.
 */
export function loanApiRoutes(db: Db, cfg: AppConfig, resolveKey?: LoanJwtKeyResolver) {
  const r = new Hono();
  const auth = requireLoanApiAuth(db, cfg, resolveKey);

  // Loanable device list (read-only, unchanged).
  r.get('/v1/loan-devices', auth, (c) => {
    return c.json(listLoanableDevices(db).map(toLoanDevice));
  });

  // Active loans — the dedicated status source for radio-inventar's device
  // overlay + dashboard. Deliberately NOT folded into /loan-devices, which
  // filters loanable=true and would hide a loan on a since-un-loanabled device.
  r.get('/v1/active-loans', auth, (c) => {
    return c.json(findActiveLoans(db).map(toActiveLoan));
  });

  // Paginated loan history (active + returned), for radio-inventar's admin
  // history view after cutover. Retention is a scheduled job, so reads do not
  // purge.
  r.get('/v1/loans/history', auth, (c) => {
    const parsed = loanHistoryParamsSchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);
    return c.json(listLoans(db, parsed.data));
  });

  // Create a loan (kiosk borrow). Device existence + loanable + condition are
  // gated HERE at the master: the kiosk is open, so the caller is not trusted to
  // enforce these. The partial unique index is the atomic guard against a
  // concurrent borrow (no SELECT-then-insert race).
  r.post('/v1/loans', auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createLoanSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { deviceId, borrowerName } = parsed.data;

    const device = getDeviceById(db, deviceId);
    if (!device) return c.json({ error: 'device_not_found' }, 404);
    if (!device.loanable) return c.json({ error: 'device_not_loanable' }, 409);
    const condition = mapDeviceCondition(device.status);
    if (condition !== 'AVAILABLE') return c.json({ error: 'device_not_available', condition }, 409);

    try {
      const loan = createLoan(db, {
        deviceId,
        snapshotCallSign: device.rufname ?? device.issi,
        snapshotSerialNumber: device.serialNumber,
        snapshotDeviceType: device.deviceType,
        borrowerName,
      });
      return c.json(loan, 201);
    } catch (err: unknown) {
      if (err instanceof LoanConflictError) return c.json({ error: 'device_already_on_loan' }, 409);
      throw err;
    }
  });

  // Return a loan (kiosk return). Atomic: a missing/already-returned loan maps to
  // 404 / 409 via the repo's distinction.
  r.patch('/v1/loans/:loanId', auth, async (c) => {
    const loanId = c.req.param('loanId');
    const body = await c.req.json().catch(() => ({}));
    const parsed = returnLoanSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

    const result = returnLoan(db, loanId, parsed.data.returnNote);
    if (!result.updated) {
      return result.alreadyReturned
        ? c.json({ error: 'loan_already_returned' }, 409)
        : c.json({ error: 'loan_not_found' }, 404);
    }
    return c.json(result.updated, 200);
  });

  return r;
}
