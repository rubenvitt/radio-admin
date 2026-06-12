import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../../docker-compose.yml', import.meta.url).pathname, 'utf8');

describe('docker-compose.yml', () => {
  it('defines exactly one service named app', () => {
    expect(yml).toMatch(/^\s{2}app:/m);
    const services = [...yml.matchAll(/^\s{2}([a-z0-9_-]+):/gm)].map((m) => m[1]);
    expect(services).toContain('app');
  });
  it('builds from the local Dockerfile', () => {
    expect(yml).toMatch(/build:\s*\./);
  });
  it('maps the server port', () => {
    expect(yml).toMatch(/3000:3000/);
  });
  it('mounts a named volume for the sqlite data dir', () => {
    expect(yml).toMatch(/:\s*\/data/);
    expect(yml).toMatch(/^volumes:/m);
  });
  it('loads env from an env file', () => {
    expect(yml).toMatch(/env_file:/);
  });
  it('sets the sqlite path under the mounted volume', () => {
    expect(yml).toMatch(/DATABASE_PATH=\/data\/data\.sqlite/);
  });
});
