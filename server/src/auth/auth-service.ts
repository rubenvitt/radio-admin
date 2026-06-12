import * as client from 'openid-client';
import type { AppConfig } from '../config';
import type { AuthService, AuthResult, OauthTx } from './types';

const SCOPE = 'openid profile email groups';

/**
 * Lazily discovers the OIDC provider once, then memoizes the Configuration.
 * Discovery (network) only happens on the first login attempt, not at import time.
 */
export function createAuthService(cfg: AppConfig): AuthService {
  let configPromise: Promise<client.Configuration> | null = null;

  const getConfig = (): Promise<client.Configuration> => {
    if (!configPromise) {
      configPromise = client.discovery(
        new URL(cfg.OIDC_ISSUER),
        cfg.OIDC_CLIENT_ID,
        cfg.OIDC_CLIENT_SECRET,
      );
    }
    return configPromise;
  };

  return {
    async startLogin(): Promise<{ authorizationUrl: string; tx: OauthTx }> {
      const config = await getConfig();
      const code_verifier = client.randomPKCECodeVerifier();
      const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
      const state = client.randomState();
      const nonce = client.randomNonce();

      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: cfg.OIDC_REDIRECT_URI,
        scope: SCOPE,
        code_challenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });

      return { authorizationUrl: url.href, tx: { state, nonce, code_verifier } };
    },

    async completeLogin(currentUrl: URL, tx: OauthTx): Promise<AuthResult> {
      const config = await getConfig();
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: tx.code_verifier,
        expectedState: tx.state,
        expectedNonce: tx.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('Missing ID token claims');
      const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
      const name =
        typeof claims.name === 'string'
          ? claims.name
          : typeof claims.preferred_username === 'string'
            ? claims.preferred_username
            : String(claims.sub);
      return { sub: String(claims.sub), name, groups };
    },
  };
}
