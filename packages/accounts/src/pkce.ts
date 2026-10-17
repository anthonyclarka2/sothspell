import { createHash } from 'node:crypto';
import { randomToken } from './tokens.js';

/**
 * PKCE keeps the authorization-code flow safe for a public-ish local client:
 * the code is useless without the verifier, and the verifier never leaves the
 * browser/server pair that started the flow.
 */
export function createCodeVerifier(): string {
  return randomToken(32);
}

export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** The `state` parameter ties the callback to the browser that started it. */
export function createOAuthState(): string {
  return randomToken(16);
}
