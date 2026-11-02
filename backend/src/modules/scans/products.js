/**
 * Which of the insurer's products fit a scanned attestation. The RMA platform PDF does not print the
 * product, so only what is certain decides (owner, 28/10/2026):
 * the attestation model (arrêté 213-05), two or three wheels ("2.R" / "3.R"), a provisional
 * series, and the RMA usages whose product the owner confirmed. Anything else is learned from the
 * agency's own choices (service.js).
 */

const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const isProvisionalProduct = (product) => plain(product.name).includes('provisoire');

// The product lines of each attestation model. Models D (Divers) and G (garagistes) say nothing
// about the product: every product is offered, except border insurance, which only model F
// (frontières) prints (rule C5).
const LINES = {
  A: ['CAR', 'TAXI', 'FLEET'],
  B: ['PASSENGER_TRANSPORT', 'TAXI', 'FLEET'],
  C: ['COMMERCIAL', 'FLEET'],
  E: ['MOTORCYCLE', 'TRIPORTEUR'],
  F: ['BORDER'],
};
const WHEELS = { '2.R': 'MOTORCYCLE', '3.R': 'TRIPORTEUR' };

// The product of each RMA GAMA "Type d'usage" the owner confirmed (28/10/2026, from photos of the
// platform's list). The PDF may print the label cut short, so only its start is compared, without
// spaces or accents. Moped 50 to 125 cm3, LOCATION C.I. and the DIVERS usages are left to the
// agency's own choice.
const usageKey = (value) =>
  plain(value)
    .replace(/[^\p{L}\p{N}<>=+,]/gu, '')
    .toUpperCase();
const USAGE_PRODUCTS = [
  [/^TOURISME$/, 'vehicules de tourisme'],
  // Also on a white model D sheet: an electric moped keeps this usage there (owner, 29/10/2026:
  // the agency files it as a scooter).
  [/^CYLINDREE<50CM3/, 'scooters', { anyModel: true }],
  [/^MOTOCYCLETTE|>125CM3/, 'motos'],
  [/^C1(?!\d)|^COMMERCE<=3,5/, 'vehicules utilitaires'],
  [/^C2(?!\d)|^COMMERCE\+3,5/, 'camions et poids lourds'],
  // « AUTO-ECOLE TOURISME », « AUTO-ECOLE 2 OU 3 ROUES » (owner, 29/10/2026): printed on a model D
  // sheet, which says nothing about the product, so this usage alone names it.
  [/^AUTOECOLE/, 'auto-ecoles', { anyModel: true }],
];

/**
 * The insurer's own usages the printed one may name ("C1 ( COMMERCE <= 3,5T)" → "C1 (COMMERCE <=
 * 3,5T)"), compared without spaces or accents: the one with the same label, else every label that
 * starts with it, as the PDF may cut it short (« CYLINDRÉE < 50 CM3 VITESSE » → < 60 or > 60 KM/H).
 */
export function insurerUsagesFor(insurerUsages, usage) {
  const key = usageKey(usage);
  if (!key) return [];
  const exact = insurerUsages.filter((u) => usageKey(u.label) === key);
  if (exact.length) return exact;
  return insurerUsages.filter((u) => usageKey(u.label).startsWith(key));
}

/** The insurer's own usage the printed one names, or null when in doubt. */
export function insurerUsageFor(insurerUsages, usage) {
  const found = insurerUsagesFor(insurerUsages, usage);
  return found.length === 1 ? found[0] : null;
}

/** The product name the printed usage points to (lower case, no accents), or null. */
export function usageProductName(usage) {
  return usageProduct(usage)?.name ?? null;
}

function usageProduct(usage) {
  const key = usageKey(usage);
  if (!key) return null;
  const found = USAGE_PRODUCTS.find(([pattern]) => pattern.test(key));
  return found ? { name: found[1], anyModel: found[2]?.anyModel ?? false } : null;
}

/** True when the product fits the sheet; null when the sheet says nothing about it. */
export function productFits(product, { modelCode, provisional, bodyType }) {
  if (provisional) return isProvisionalProduct(product);
  if (isProvisionalProduct(product)) return false;
  if (product.line === 'BORDER') return modelCode === 'F';
  const lines = LINES[modelCode];
  if (!lines) return null;
  if (modelCode === 'E' && WHEELS[bodyType]) return product.line === WHEELS[bodyType];
  return lines.includes(product.line);
}

/**
 * The product the sheet itself points to: the only one that fits, or the one its printed usage
 * names, when that product fits the attestation model (taxis and fleets are told on the screen),
 * or, for a driving-school usage, when the model says nothing about it (model D). Null when in
 * doubt.
 */
export function ruleProduct(products, sheet) {
  const fitting = products.filter((product) => productFits(product, sheet));
  if (fitting.length === 1) return fitting[0];
  const named = usageProduct(sheet.usage);
  if (!named) return null;
  const candidates = products.filter((product) => {
    const fits = productFits(product, sheet);
    return plain(product.name) === named.name && (fits || (fits === null && named.anyModel));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** The kind of printed sheet, to remember the product chosen for it: "RMA|14E|2.R|CYLINDREE<50CM3VITESSE". */
export function sheetKind(proposed) {
  const key = (value) =>
    plain(value)
      .replace(/[^\p{L}\p{N}.<>]/gu, '')
      .toUpperCase();
  if (!proposed?.insurerCode || !proposed?.seriesCode) return null;
  return [proposed.insurerCode, proposed.seriesCode, proposed.bodyType, proposed.usage]
    .map(key)
    .join('|');
}
