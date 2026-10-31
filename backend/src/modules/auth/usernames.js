export const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export function normalizeUsername(username) {
  return String(username ?? '')
    .trim()
    .toLowerCase();
}

/**
 * What the audit log may record about a typed username. People sometimes type their password
 * into the username field: anything that cannot be a username is not recorded.
 */
export function auditableUsername(name) {
  return USERNAME_PATTERN.test(name) ? name : '[format invalide]';
}
