import { describe, expect, it } from 'vitest';
import { formatLongDate } from '../src/utils/format.js';

describe('a day in words', () => {
  it('writes the calendar date as given, whatever the PC clock zone', () => {
    expect(formatLongDate('2026-11-04')).toBe('Mercredi 4 novembre 2026');
    // Midnight and the last day of the year do not slip to the day before.
    expect(formatLongDate('2026-12-31')).toBe('Jeudi 31 décembre 2026');
    expect(formatLongDate('2028-02-29')).toBe('Mardi 29 février 2028');
  });

  it('leaves an empty value empty', () => {
    expect(formatLongDate(null)).toBeNull();
    expect(formatLongDate(undefined)).toBeUndefined();
  });
});
