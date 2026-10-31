/** Lower-case, accent-free, single-spaced text for search ("Hôtel  Atlas" → "hotel atlas"). */
export function searchable(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phone number in international form (E.164), or null when it cannot be read.
 * Moroccan numbers: 0612345678 → +212612345678; 00… and +… are kept as international numbers.
 */
export function normalizePhone(input) {
  const raw = String(input ?? '').replace(/[\s.\-()/]/g, '');
  if (/^0[5-8]\d{8}$/.test(raw)) return `+212${raw.slice(1)}`;
  if (/^212[5-8]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^00\d{8,15}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  return null;
}

export const IDENTITY_PATTERNS = {
  // Carte nationale d'identité électronique: one or two letters, then digits (e.g. AB123456).
  CIN: /^[A-Z]{1,2}\d{1,7}$/,
  PASSPORT: /^[A-Z0-9]{5,20}$/,
  RESIDENCE_CARD: /^[A-Z0-9]{5,20}$/,
};

export function normalizeIdentityNumber(input) {
  return String(input ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** "AB123456" → "AB****56". Short values are fully hidden. */
export function maskIdentityNumber(value) {
  if (!value) return value;
  if (value.length < 6) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
}

/**
 * Registration plate. `display` keeps the plate as written (upper-case, single spaces, "|" → "-");
 * `key` keeps letters and digits only, so "12345-B-6", "12345 B 6" and "12345|B|6" are the same
 * plate. Arabic letters are kept as they are (no transliteration: it is not one-to-one).
 */
export function normalizeRegistration(input) {
  const display = String(input ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '-')
    .toUpperCase();
  const key = display.replace(/[^\p{L}\p{N}]/gu, '');
  return { display, key };
}

/** Chassis number (VIN): upper-case, no spaces or dashes. */
export function normalizeVin(input) {
  return String(input ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** Identifiant Commun de l'Entreprise: 15 digits (spaces allowed when typed). */
export function normalizeIce(input) {
  return String(input ?? '').replace(/\s/g, '');
}
