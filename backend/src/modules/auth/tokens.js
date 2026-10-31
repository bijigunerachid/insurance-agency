import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-session';

/** 256-bit random session token, sent only in the HttpOnly cookie. */
export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** What the database stores instead of the token. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * CSRF token derived from the session token. Scripts on other sites cannot read the
 * HttpOnly cookie, so they cannot compute it.
 */
export function csrfTokenFor(sessionToken) {
  return createHash('sha256').update(`csrf:${sessionToken}`).digest('base64url');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
