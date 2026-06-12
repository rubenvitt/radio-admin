import type { AuthService, AuthResult, OauthTx } from './types';

export interface FakeAuthOptions {
  /** tx values returned by startLogin and expected by completeLogin */
  tx?: OauthTx;
  authorizationUrl?: string;
  /** claims completeLogin resolves to */
  result?: AuthResult;
  /** if set, completeLogin rejects with this error */
  failWith?: Error;
}

export function createFakeAuthService(opts: FakeAuthOptions = {}): AuthService {
  const tx: OauthTx = opts.tx ?? {
    state: 'state-123',
    nonce: 'nonce-123',
    code_verifier: 'verifier-123',
  };
  const authorizationUrl =
    opts.authorizationUrl ?? 'https://id.example.org/authorize?state=state-123';
  const result: AuthResult = opts.result ?? {
    sub: 'user-1',
    name: 'Test User',
    groups: ['admin'],
  };
  return {
    async startLogin() {
      return { authorizationUrl, tx };
    },
    async completeLogin() {
      if (opts.failWith) throw opts.failWith;
      return result;
    },
  };
}
