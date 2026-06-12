import { describe, it, expect } from 'vitest';
import { signOauthTx, verifyOauthTx } from './oauth-tx';

const secret = 'super-secret-value-at-least-16';
const tx = { state: 's1', nonce: 'n1', code_verifier: 'v1' };

describe('oauth_tx cookie helpers', () => {
  it('round-trips the tx values', async () => {
    const token = await signOauthTx(tx, secret);
    expect(await verifyOauthTx(token, secret)).toEqual(tx);
  });

  it('rejects a tx signed with a different secret', async () => {
    const token = await signOauthTx(tx, secret);
    await expect(verifyOauthTx(token, 'another-secret-value-1234')).rejects.toThrow();
  });

  it('rejects an expired tx', async () => {
    const token = await signOauthTx(tx, secret, '-1s');
    await expect(verifyOauthTx(token, secret)).rejects.toThrow();
  });

  it('rejects garbage', async () => {
    await expect(verifyOauthTx('garbage', secret)).rejects.toThrow();
  });
});
