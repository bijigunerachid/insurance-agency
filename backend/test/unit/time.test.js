import { describe, expect, it } from 'vitest';
import { startOfNextZonedDay, startOfZonedDay } from '../../src/utils/time.js';

const TZ = 'Africa/Casablanca';

// Morocco's legal time comes from the IANA time-zone data (tzdata), never from a fixed offset:
// UTC+1 from 2018 (UTC+0 during Ramadan), then back to GMT (UTC+0) on 20 September 2026
// (décret n° 2.26.530). These cases need tzdata 2026 or later, which Node 24 ships.
describe('zoned day boundaries (Africa/Casablanca)', () => {
  it('uses UTC+1 under the 2018–2026 rules', () => {
    expect(startOfZonedDay('2025-06-01', TZ).toISOString()).toBe('2025-05-31T23:00:00.000Z');
  });

  it('uses UTC+0 during Ramadan under the 2018–2026 rules', () => {
    expect(startOfZonedDay('2025-03-10', TZ).toISOString()).toBe('2025-03-10T00:00:00.000Z');
  });

  it('uses UTC+0 after the return to GMT on 20 September 2026', () => {
    expect(startOfZonedDay('2026-10-22', TZ).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(startOfNextZonedDay('2026-12-31', TZ).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('gives a day that really starts at local midnight, whatever the offset', () => {
    for (const day of ['2025-01-15', '2025-03-10', '2025-08-01', '2026-09-19', '2026-09-21']) {
      const start = startOfZonedDay(day, TZ);
      const local = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TZ,
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(start);
      expect(local).toBe(`${day} 00:00:00`);
    }
  });
});
