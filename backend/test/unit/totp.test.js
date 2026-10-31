import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from '../../src/modules/auth/totp.js';

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" (last 6 of the 8-digit values).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected);
    }
  });

  it('accepts the current code and one step of clock drift either side', () => {
    const now = new Date(1111111111 * 1000);
    const step = Math.floor(1111111111 / 30);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), { now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), { now })).toBeNull();
  });

  it('refuses a code that was already used (replay)', () => {
    const now = new Date(1234567890 * 1000);
    const step = Math.floor(1234567890 / 30);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step - 1 })).toBe(step);
  });

  it('rejects malformed codes', () => {
    const now = new Date();
    for (const code of ['', '12345', '1234567', 'abcdef', undefined, 123456]) {
      expect(verifyTotp(RFC_SECRET, code, { now })).toBeNull();
    }
  });

  it('generates 160-bit secrets that round-trip through base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('builds an otpauth URI for authenticator apps', () => {
    const uri = otpauthUri('ABC', { issuer: 'Agence assurances', account: 'admin' });
    expect(uri).toBe(
      'otpauth://totp/Agence%20assurances%3Aadmin?secret=ABC&issuer=Agence+assurances&algorithm=SHA1&digits=6&period=30',
    );
  });
});
