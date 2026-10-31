export const APP_TIME_ZONE = 'Africa/Casablanca';

const dateTimeFormatter = new Intl.DateTimeFormat('fr-MA', {
  timeZone: APP_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
});

/**
 * Moroccan numbers in the familiar local form ("+212612345678" → "06 12 34 56 78");
 * other international numbers unchanged.
 */
export function formatPhone(e164) {
  if (!e164) return e164;
  const match = /^\+212(\d{9})$/.exec(e164);
  return match ? `0${match[1]}`.replace(/(\d{2})(?=\d)/g, '$1 ') : e164;
}

/** A calendar date "YYYY-MM-DD" shown as DD/MM/YYYY (no time zone involved). */
export function formatDate(isoDate) {
  if (!isoDate) return isoDate;
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Date and time in the agency's time zone, e.g. 22/10/2026 14:05:09. Accepts ISO strings. */
export function formatDateTime(date) {
  return dateTimeFormatter.format(typeof date === 'string' ? new Date(date) : date);
}

const dayFormatter = new Intl.DateTimeFormat('fr-MA', {
  timeZone: APP_TIME_ZONE,
  dateStyle: 'short',
});

/** The day of a timestamp in the agency's time zone, e.g. 22/10/2026. Accepts ISO strings. */
export function formatDay(timestamp) {
  return dayFormatter.format(typeof timestamp === 'string' ? new Date(timestamp) : timestamp);
}

// fr-FR grouping (1 234,50): fr-MA groups thousands with a dot in some ICU versions.
const moneyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' });

/** An amount sent by the API as a string ("1234.50") shown in MAD, e.g. 1 234,50 MAD. */
export function formatMoney(amount) {
  if (amount === null || amount === undefined) return amount;
  // Browsers group thousands with a narrow space that is hard to see: use a regular one.
  return moneyFormatter.format(Number(amount)).replace(/\u202f/g, '\u00a0');
}

/** "+0,45 MAD" or "−0,66 MAD": the sign says whether the agency kept or covered it. */
export function signedMoney(amount) {
  const value = Number(amount);
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`;
}
