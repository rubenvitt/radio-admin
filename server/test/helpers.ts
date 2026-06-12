import { signSession } from '../src/auth/session';
import { SESSION_COOKIE } from '../src/auth/oauth-tx';
import { loadConfig, type AppConfig } from '../src/config';
import { buildApp } from '../src/app';
import type { Db } from '../src/repos/deviceRepo';
import type { Role } from '@ra/shared';

/** A fixed secret shared by the test config and `authCookie` so signed cookies verify. */
export const TEST_SECRET = 'test-session-secret-0123456789-abcd';

/**
 * A valid `AppConfig` for tests: the same secret that `authCookie` signs with,
 * placeholder OIDC values to satisfy the schema, and dev-bypass OFF so the real
 * cookie/session path is exercised.
 */
export const testConfig: AppConfig = loadConfig({
  SESSION_SECRET: TEST_SECRET,
  OIDC_ISSUER: 'https://issuer.example',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'secret',
  OIDC_REDIRECT_URI: 'https://app.example/callback',
  AUTH_DEV_BYPASS: 'false',
});

/** Mint a `Cookie` header value carrying a valid session for the given user. */
export async function authCookie(user: {
  sub: string;
  name: string;
  role: Role;
}): Promise<string> {
  const token = await signSession(
    { sub: user.sub, name: user.name, role: user.role },
    TEST_SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

export const adminUser = { sub: 'u-admin', name: 'Admin', role: 'admin' as const };
export const updaterUser = { sub: 'u-updater', name: 'Updater', role: 'updater' as const };

/** Build the full app wired to an in-memory test db, using the shared test config. */
export function buildTestApp(db: Db) {
  return buildApp(testConfig, db);
}
