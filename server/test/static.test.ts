import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountStatic } from '../src/static.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ra-dist-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>RA</title>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function makeApp() {
  const real = new Hono();
  real.get('/api/auth/me', (c) => c.json({ name: 'x', role: 'admin' }));
  mountStatic(real, dir);
  return real;
}

describe('mountStatic', () => {
  it('serves index.html at /', async () => {
    const res = await makeApp().request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>RA</title>');
  });

  it('serves a built asset', async () => {
    const res = await makeApp().request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('console.log');
  });

  it('falls back to index.html for unknown SPA routes', async () => {
    const res = await makeApp().request('/devices/abc123');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>RA</title>');
  });

  it('does NOT fall back for /api/* (returns JSON 404, not index.html)', async () => {
    const res = await makeApp().request('/api/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('<title>RA</title>');
  });

  it('still routes real /api endpoints', async () => {
    const res = await makeApp().request('/api/auth/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'x', role: 'admin' });
  });
});
