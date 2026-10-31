import { readFileSync } from 'node:fs';
import argon2 from 'argon2';

// OWASP-recommended Argon2id settings (memory 64 MiB, 3 passes). needsRehash() upgrades
// older hashes at the next successful login if these values change.
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const COMMON = new Set(
  readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
);

export function hashPassword(password) {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(hash) {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

// Verified against when the username does not exist, so both cases take the same time.
const dummyHash = hashPassword('timing-equaliser-not-a-real-password');
export async function burnPasswordCheck(password) {
  await verifyPassword(await dummyHash, password);
}

/** Returns a list of policy problem codes; an empty list means the password is acceptable. */
export function passwordProblems(password, { username } = {}) {
  const problems = [];
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) problems.push('TOO_SHORT');
  if (typeof password === 'string' && password.length > PASSWORD_MAX) problems.push('TOO_LONG');
  if (typeof password !== 'string') return problems;

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push('TOO_COMMON');
  if (/^(.)\1+$/.test(password)) problems.push('REPEATED_CHARACTER');
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    problems.push('CONTAINS_USERNAME');
  }
  return problems;
}
