import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30-second steps),
// the format every authenticator app supports. Works without Internet.
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function timeStep(date) {
  return Math.floor(date.getTime() / 1000 / STEP_SECONDS);
}

export function totpCode(secretBase32, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(binary).padStart(DIGITS, '0');
}

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Returns the matched step, or null. Steps at or before `lastUsedStep` are refused
 * so a code cannot be replayed.
 */
export function verifyTotp(secretBase32, code, { now, lastUsedStep = null }) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = timeStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secretBase32, { issuer, account }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text) {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
