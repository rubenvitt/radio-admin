import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const df = readFileSync(new URL('../../Dockerfile', import.meta.url).pathname, 'utf8');

describe('Dockerfile', () => {
  it('has deps, build and runtime stages', () => {
    expect(df).toMatch(/AS deps/);
    expect(df).toMatch(/AS build/);
    expect(df).toMatch(/AS runtime/);
  });
  it('enables pnpm via corepack', () => {
    expect(df).toMatch(/corepack enable/);
  });
  it('installs with a frozen lockfile', () => {
    expect(df).toMatch(/pnpm install --frozen-lockfile/);
  });
  it('builds shared, client and server', () => {
    expect(df).toMatch(/@ra\/shared.*build|--filter @ra\/shared build/);
    expect(df).toMatch(/@ra\/client.*build|--filter @ra\/client build/);
    expect(df).toMatch(/@ra\/server.*build|--filter @ra\/server build/);
  });
  it('rebuilds the better-sqlite3 native binding in runtime', () => {
    expect(df).toMatch(/better-sqlite3/);
  });
  it('copies the built client dist into the runtime image', () => {
    expect(df).toMatch(/client\/dist/);
  });
  it('copies migrations into the runtime image', () => {
    expect(df).toMatch(/server\/drizzle/);
  });
  it('runs as a non-root user', () => {
    expect(df).toMatch(/USER node/);
  });
  it('uses the entrypoint script', () => {
    expect(df).toMatch(/entrypoint\.sh/);
  });
  it('exposes the server port', () => {
    expect(df).toMatch(/EXPOSE 3000/);
  });
});
