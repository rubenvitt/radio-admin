import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const base = {
  DATABASE_PATH: '/tmp/test.sqlite',
  SESSION_SECRET: 'super-secret-value-at-least-16',
  OIDC_ISSUER: 'https://id.example.org',
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 'secret-1',
  OIDC_REDIRECT_URI: 'https://app.example.org/api/auth/callback',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.OIDC_ADMIN_GROUP).toBe('admin');
    expect(cfg.OIDC_UPDATER_GROUP).toBe('personal');
    expect(cfg.AUTH_DEV_BYPASS).toBe(false);
    expect(cfg.DEV_USER_ROLE).toBe('admin');
    expect(cfg.DEV_USER_NAME).toBe('Dev User');
    expect(cfg.PORT).toBe(3000);
  });

  it('coerces PORT to a number and AUTH_DEV_BYPASS to boolean', () => {
    const cfg = loadConfig({ ...base, PORT: '8080', AUTH_DEV_BYPASS: 'true' });
    expect(cfg.PORT).toBe(8080);
    expect(cfg.AUTH_DEV_BYPASS).toBe(true);
  });

  it('DEV_USER_ROLE only accepts admin|updater', () => {
    expect(() => loadConfig({ ...base, DEV_USER_ROLE: 'superuser' })).toThrow();
    expect(loadConfig({ ...base, DEV_USER_ROLE: 'updater' }).DEV_USER_ROLE).toBe('updater');
  });

  it('throws when required OIDC fields are missing', () => {
    const { OIDC_ISSUER, ...without } = base;
    expect(() => loadConfig(without)).toThrow(/OIDC_ISSUER/);
  });

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});
