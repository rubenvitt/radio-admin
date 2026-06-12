import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { Db } from '../repos/deviceRepo';
import { listLoanableDevices } from '../repos/deviceRepo';
import { verifyApiToken } from '../repos/apiTokenRepo';
import type { DeviceRecord } from '@ra/shared';

/** PUBLIC loan-device view: a deliberate subset, no audit/internal/software fields. */
export interface LoanDevice {
  issi: string;
  opta: string | null;
  rufname: string | null;
  status: string | null;
  location: string | null;
  deviceType: string | null;
  hersteller: string | null;
  bedieneinheit: string | null;
  funktion: string | null;
}

function toLoanDevice(d: DeviceRecord): LoanDevice {
  return {
    issi: d.issi,
    opta: d.opta,
    rufname: d.rufname,
    status: d.status,
    location: d.location,
    deviceType: d.deviceType,
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

/** Token-auth guard for the public loan API: 401 on missing/invalid/revoked token. */
function requireApiToken(db: Db): MiddlewareHandler {
  return async (c, next) => {
    const token = extractToken(c.req.header('Authorization'), c.req.header('X-API-Key'));
    if (!token) return c.json({ error: 'unauthorized' }, 401);
    const record = verifyApiToken(db, token);
    if (!record) return c.json({ error: 'unauthorized' }, 401);
    return next();
  };
}

/**
 * Public, token-authed loan API. MOUNTED BEFORE the `/api/*` session guard in
 * buildApp, so it is reachable without a browser session — service callers
 * authenticate with an API token instead.
 */
export function loanApiRoutes(db: Db) {
  const r = new Hono();
  r.get('/v1/loan-devices', requireApiToken(db), (c) => {
    return c.json(listLoanableDevices(db).map(toLoanDevice));
  });
  return r;
}
