import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from './session';

const secret = 'super-secret-value-at-least-16';

describe('session JWT (jose HS256)', () => {
  it('round-trips claims', async () => {
    const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
    const claims = await verifySession(token, secret);
    expect(claims.sub).toBe('u1');
    expect(claims.name).toBe('Alice');
    expect(claims.role).toBe('admin');
    expect(typeof claims.exp).toBe('number');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession({ sub: 'u1', name: 'A', role: 'updater' }, secret);
    await expect(verifySession(token, 'a-totally-different-secret!!')).rejects.toThrow();
  });

  it('rejects a tampered/garbage token', async () => {
    await expect(verifySession('not.a.jwt', secret)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signSession(
      { sub: 'u1', name: 'A', role: 'admin' },
      secret,
      '-1s', // already expired
    );
    await expect(verifySession(token, secret)).rejects.toThrow();
  });
});
