import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { Db } from '../repos/deviceRepo';
import { listLoanableDevices } from '../repos/deviceRepo';
import { verifyApiToken } from '../repos/apiTokenRepo';
import { verifyLoanJwt, type LoanJwtKeyResolver } from '../auth/loan-api-jwt';
import type { AppConfig } from '../config';
import type { DeviceRecord } from '@ra/shared';

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

/**
 * Public, token-authed loan API. MOUNTED BEFORE the `/api/*` session guard in
 * buildApp, so it is reachable without a browser session — service callers
 * authenticate with an API token or an OIDC client_credentials JWT instead.
 *
 * `resolveKey` is an optional JWKS resolver seam for tests; production uses the
 * built-in remote resolver (OIDC discovery + JWKS) in loan-api-jwt.
 */
export function loanApiRoutes(db: Db, cfg: AppConfig, resolveKey?: LoanJwtKeyResolver) {
  const r = new Hono();
  r.get('/v1/loan-devices', requireLoanApiAuth(db, cfg, resolveKey), (c) => {
    return c.json(listLoanableDevices(db).map(toLoanDevice));
  });
  return r;
}
