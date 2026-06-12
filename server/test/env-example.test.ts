import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const path = new URL('../../.env.example', import.meta.url).pathname;

const REQUIRED = [
  'DATABASE_PATH',
  'SESSION_SECRET',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_ADMIN_GROUP',
  'OIDC_UPDATER_GROUP',
  'AUTH_DEV_BYPASS',
  'DEV_USER_ROLE',
  'DEV_USER_NAME',
  'PORT',
  'STATIC_DIR',
  'MIGRATIONS_DIR',
] as const;

describe('.env.example', () => {
  const content = readFileSync(path, 'utf8');
  for (const key of REQUIRED) {
    it(`documents ${key}`, () => {
      expect(content).toMatch(new RegExp(`^${key}=`, 'm'));
    });
  }
  it('defaults AUTH_DEV_BYPASS to false (fail-safe)', () => {
    expect(content).toMatch(/^AUTH_DEV_BYPASS=false\s*$/m);
  });
  it('does not contain a real secret', () => {
    expect(content).not.toMatch(/SESSION_SECRET=.{16,}/);
  });
});
