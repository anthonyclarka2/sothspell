import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sothspell_session';
export const OAUTH_COOKIE = 'sothspell_oauth';
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function signatureFor(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * Values in cookies and bearer tokens are `<payload>.<hmac>`. The payload is
 * random and opaque; the signature is what makes a stolen-but-edited cookie
 * useless even if the session row still exists.
 */
export function signValue(value: string, secret: string): string {
  return `${value}.${signatureFor(value, secret)}`;
}

export function verifySignedValue(signed: string, secret: string): string | null {
  const separator = signed.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const value = signed.slice(0, separator);
  const provided = Buffer.from(signed.slice(separator + 1));
  const expected = Buffer.from(signatureFor(value, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return value;
}

export function createSessionToken(sessionId: string, secret: string): string {
  return signValue(sessionId, secret);
}

export function parseSessionToken(token: string, secret: string): string | null {
  return verifySignedValue(token, secret);
}

/** The PKCE verifier rides in a signed, short-lived cookie between start and callback. */
export function encodeOAuthState(
  state: string,
  verifier: string,
  secret: string,
): string {
  return signValue(`${state}.${verifier}`, secret);
}

export function decodeOAuthState(
  value: string,
  secret: string,
): { state: string; verifier: string } | null {
  const payload = verifySignedValue(value, secret);
  if (!payload) {
    return null;
  }
  const separator = payload.indexOf('.');
  if (separator <= 0) {
    return null;
  }
  return {
    state: payload.slice(0, separator),
    verifier: payload.slice(separator + 1),
  };
}
