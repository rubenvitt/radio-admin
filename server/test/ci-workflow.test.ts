import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url).pathname, 'utf8');

describe('ci.yml test job', () => {
  it('triggers on pull_request and push', () => {
    expect(yml).toMatch(/pull_request:/);
    expect(yml).toMatch(/push:/);
  });
  it('defines a test job', () => {
    expect(yml).toMatch(/^\s{2}test:/m);
  });
  it('uses pnpm and the frozen lockfile', () => {
    expect(yml).toMatch(/pnpm\/action-setup/);
    expect(yml).toMatch(/pnpm install --frozen-lockfile/);
  });
  it('runs lint, typecheck and vitest', () => {
    const lint = yml.indexOf('lint');
    const typecheck = yml.indexOf('typecheck');
    const test = yml.indexOf('vitest run');
    expect(lint).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(-1);
  });
});

describe('ci.yml docker job', () => {
  it('defines a docker job that needs test', () => {
    expect(yml).toMatch(/^\s{2}docker:/m);
    expect(yml).toMatch(/needs:\s*test/);
  });
  it('only runs on push to main or tags (not PRs)', () => {
    expect(yml).toMatch(/github\.event_name == 'push'/);
  });
  it('grants packages:write permission', () => {
    expect(yml).toMatch(/packages:\s*write/);
  });
  it('logs into ghcr.io with GITHUB_TOKEN', () => {
    expect(yml).toMatch(/docker\/login-action/);
    expect(yml).toMatch(/registry:\s*ghcr\.io/);
    expect(yml).toMatch(/password:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });
  it('targets ghcr.io/<owner/repo> with latest/sha/tag', () => {
    expect(yml).toMatch(/ghcr\.io\/\$\{\{\s*github\.repository\s*\}\}/);
    expect(yml).toMatch(/type=sha/);
    expect(yml).toMatch(/type=raw,value=latest/);
    expect(yml).toMatch(/type=ref,event=tag/);
  });
  it('uses buildx and build-push-action', () => {
    expect(yml).toMatch(/docker\/setup-buildx-action/);
    expect(yml).toMatch(/docker\/build-push-action/);
  });
  it('builds a multi-arch image (amd64 + arm64) with QEMU', () => {
    expect(yml).toMatch(/docker\/setup-qemu-action/);
    expect(yml).toMatch(/platforms:\s*linux\/amd64,linux\/arm64/);
  });
  it('runs the smoke test before pushing', () => {
    const smoke = yml.indexOf('smoke.sh');
    const push = yml.indexOf('push: true');
    expect(smoke).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(smoke).toBeLessThan(push);
  });
});
