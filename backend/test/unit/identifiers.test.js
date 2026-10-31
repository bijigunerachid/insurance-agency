import { describe, expect, it } from 'vitest';
import {
  maskIdentityNumber,
  normalizeIdentityNumber,
  normalizePhone,
  normalizeRegistration,
  normalizeVin,
  searchable,
} from '../../src/utils/identifiers.js';

describe('identifiers', () => {
  it('normalises Moroccan and international phone numbers', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+212612345678');
    expect(normalizePhone('0522-11-22-33')).toBe('+212522112233');
    expect(normalizePhone('212712345678')).toBe('+212712345678');
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('+34 612 345 678')).toBe('+34612345678');
    for (const bad of ['12345', '0912345678', 'abc', '']) expect(normalizePhone(bad)).toBeNull();
  });

  it('treats differently written plates as the same plate', () => {
    const keys = ['12345-B-6', '12345 b 6', ' 12345|B|6 ', '12345B6'].map(
      (plate) => normalizeRegistration(plate).key,
    );
    expect(new Set(keys)).toEqual(new Set(['12345B6']));
    expect(normalizeRegistration('12345 | b | 6').display).toBe('12345 - B - 6');
    expect(normalizeRegistration('12345-ب-6')).toEqual({ display: '12345-ب-6', key: '12345ب6' });
  });

  it('normalises identity numbers, chassis numbers and search text', () => {
    expect(normalizeIdentityNumber(' ab 123-456 ')).toBe('AB123456');
    expect(normalizeVin('vf1-ab000 1234')).toBe('VF1AB0001234');
    expect(searchable('  Hôtel   ATLAS Smirès ')).toBe('hotel atlas smires');
  });

  it('masks identity numbers, hiding short ones completely', () => {
    expect(maskIdentityNumber('AB123456')).toBe('AB****56');
    expect(maskIdentityNumber('A1234')).toBe('*****');
    expect(maskIdentityNumber(null)).toBeNull();
  });
});
