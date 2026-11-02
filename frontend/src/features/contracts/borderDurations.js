/**
 * The durations CAT sells border insurance for (rule C5, owner 02/11/2026). The platform counts
 * like the provisional attestation: the same day 5 or 10 days, or 1, 3 or 6 months later. Same
 * limit as the server: 6 months at most.
 */
export const BORDER_DURATIONS = [
  { key: '5d', days: 5 },
  { key: '10d', days: 10 },
  { key: '1m', months: 1 },
  { key: '3m', months: 3 },
  { key: '6m', months: 6 },
];

/** The end date of a border contract starting on `start` (YYYY-MM-DD) for `duration`. */
export function borderEnd(start, { days = 0, months = 0 }) {
  const [year, month, day] = start.split('-').map(Number);
  if (months) {
    // The month's last day when it is shorter (31/08 + 6 months = 28 or 29/02).
    const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)))
      .toISOString()
      .slice(0, 10);
  }
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
