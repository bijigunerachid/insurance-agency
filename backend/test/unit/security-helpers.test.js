import { describe, expect, it } from 'vitest';
import { createGuards } from '../../src/middleware/auth.js';
import {
  passwordProblems,
  hashPassword,
  verifyPassword,
} from '../../src/modules/auth/passwords.js';
import { computeStage } from '../../src/modules/auth/service.js';
import {
  csrfTokenFor,
  hashToken,
  newSessionToken,
  safeEqual,
} from '../../src/modules/auth/tokens.js';
import { createSecretBox } from '../../src/services/secretBox.js';
import { parseCookies } from '../../src/utils/cookies.js';

describe('secretBox', () => {
  const box = createSecretBox(Buffer.alloc(32, 3).toString('base64'));

  it('encrypts with a random IV and decrypts', () => {
    const a = box.encrypt('JBSWY3DPEHPK3PXP');
    const b = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering and wrong keys', () => {
    const sealed = box.encrypt('secret');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('other!').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    const otherBox = createSecretBox(Buffer.alloc(32, 4).toString('base64'));
    expect(() => otherBox.decrypt(sealed)).toThrow();
  });
});

describe('password policy', () => {
  it('accepts a long, uncommon password', () => {
    expect(passwordProblems('Vélo-Rouge-Tanger-2026!', { username: 'karim' })).toEqual([]);
  });

  it('lists every problem', () => {
    expect(passwordProblems('short')).toContain('TOO_SHORT');
    expect(passwordProblems('x'.repeat(129))).toContain('TOO_LONG');
    expect(passwordProblems('aaaaaaaaaaaaaa')).toContain('REPEATED_CHARACTER');
    expect(passwordProblems('Azerty123456')).toContain('TOO_COMMON');
    expect(passwordProblems('karim-is-the-best', { username: 'Karim' })).toContain(
      'CONTAINS_USERNAME',
    );
  });

  it('hashes with Argon2id and verifies', async () => {
    const hash = await hashPassword('Vélo-Rouge-Tanger-2026!');
    const params = hash.split('$')[3].split(',').sort();
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(params).toEqual(['m=65536', 'p=1', 't=3']);
    expect(await verifyPassword(hash, 'Vélo-Rouge-Tanger-2026!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('tokens and cookies', () => {
  it('creates unpredictable tokens and stores only their hash', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfTokenFor(token)).not.toBe(token);
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
  });

  it('parses cookies and ignores malformed values', () => {
    expect(parseCookies('a=1; __Host-session=xyz; b=%E0%A4%A')).toEqual({
      a: '1',
      '__Host-session': 'xyz',
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('computeStage', () => {
  const role = (requiresTwoFactor) => ({ requiresTwoFactor });

  it('checks an enrolled second factor before a forced password change', () => {
    const user = { totpEnabledAt: new Date(), mustChangePassword: true, role: role(true) };
    expect(computeStage(user, { totpVerified: false })).toBe('TOTP_VERIFY');
    expect(computeStage(user, { totpVerified: true })).toBe('PASSWORD_CHANGE');
  });

  it('requires enrolment for roles that need two-factor', () => {
    const user = { totpEnabledAt: null, mustChangePassword: false, role: role(true) };
    expect(computeStage(user, { totpVerified: false })).toBe('TOTP_ENROLL');
  });

  it('lets other roles in directly', () => {
    const user = { totpEnabledAt: null, mustChangePassword: false, role: role(false) };
    expect(computeStage(user, { totpVerified: false })).toBe('ACTIVE');
  });
});

describe('requireRecentAuth', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const { requireRecentAuth } = createGuards({ audit: {}, clock: { now: () => now } });
  const req = (reauthAt) => ({ auth: { session: { stage: 'ACTIVE', reauthAt } } });

  it('passes within five minutes of re-authentication', () => {
    let called = false;
    requireRecentAuth(req(new Date(now - 4 * 60 * 1000)), {}, () => (called = true));
    expect(called).toBe(true);
  });

  it('refuses when re-authentication is missing or older than five minutes', () => {
    expect(() => requireRecentAuth(req(null), {}, () => {})).toThrow(/Confirmez/);
    expect(() => requireRecentAuth(req(new Date(now - 6 * 60 * 1000)), {}, () => {})).toThrow(
      /Confirmez/,
    );
  });
});
