import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const path = new URL('../../scripts/smoke.sh', import.meta.url).pathname;
const s = readFileSync(path, 'utf8');

describe('scripts/smoke.sh', () => {
  it('is executable', () => {
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
  });
  it('runs the container with dev bypass and a session secret', () => {
    expect(s).toMatch(/AUTH_DEV_BYPASS=true/);
    expect(s).toMatch(/SESSION_SECRET=/);
  });
  it('overrides NODE_ENV away from production so the dev bypass is allowed to boot', () => {
    // The image sets NODE_ENV=production; config refuses the bypass in prod, so the
    // smoke container must override it (else the container never starts).
    expect(s).toMatch(/NODE_ENV=development/);
  });
  it('checks the SPA root returns 200', () => {
    expect(s).toMatch(/localhost:3000\/(["' ]|$)/m);
  });
  it('checks /api/auth/me returns 200', () => {
    expect(s).toMatch(/\/api\/auth\/me/);
  });
  it('cleans up the container on exit', () => {
    expect(s).toMatch(/docker rm -f|--rm|trap /);
  });
});
