import type { Role } from '@ra/shared';

export interface SessionClaims {
  sub: string;
  name: string;
  role: Role;
  exp: number; // unix seconds (set by jose)
}

export interface OauthTx {
  state: string;
  nonce: string;
  code_verifier: string;
}

/** Result of a successful authorization-code exchange. */
export interface AuthResult {
  sub: string;
  name: string;
  groups: string[];
}

/** The seam the routes depend on; the real impl wraps openid-client, tests fake it. */
export interface AuthService {
  /** Builds the provider authorization URL and the tx values to persist in the oauth_tx cookie. */
  startLogin(): Promise<{ authorizationUrl: string; tx: OauthTx }>;
  /** Exchanges the callback URL for verified claims, validating state/nonce/PKCE. */
  completeLogin(currentUrl: URL, tx: OauthTx): Promise<AuthResult>;
}
