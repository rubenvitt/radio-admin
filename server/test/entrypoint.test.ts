import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const path = new URL('../../docker/entrypoint.sh', import.meta.url).pathname;

describe('docker/entrypoint.sh', () => {
  const script = readFileSync(path, 'utf8');

  it('runs migrations before starting the server', () => {
    const migrateIdx = script.indexOf('migrate');
    const serverIdx = script.indexOf('dist/index.js');
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(serverIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeLessThan(serverIdx);
  });

  it('uses set -e and exec for signal forwarding', () => {
    expect(script).toMatch(/set -e/);
    expect(script).toMatch(/exec node/);
  });

  it('is executable', () => {
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
  });
});
