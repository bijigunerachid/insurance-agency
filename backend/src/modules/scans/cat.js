/**
 * Values of the PDF that the CAT platform makes to print on the agency's pre-printed paper
 * (« Attestation_Definitive… »): only
 * the values, each at the place of its field. Left half: « Conditions particulières du contrat
 * CAT-Assurance automobile »; right half: the attestation. The series (« 91 B ») and the usage
 * heading are printed on the paper, not in the PDF; the attestation number is. Lines are
 * recognised by what they hold and by the form's fixed order.
 */
import { FUELS, amount, isoDate, wordDate } from './platform.js';

const noSpace = (text) => String(text ?? '').replace(/\s/g, '');
// « 31/05/2025 à 00:00 ».
const STAMP = /^(\d{2})\/(\d{2})\/(\d{4})\s*à\s*\d{2}:\d{2}$/;
const SLASH_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
// A CIN (« AB123456 ») or a trade register number (« ER812541 »).
const IDENTITY = /^[A-Z]{1,3}\d{3,10}$/;

const stampDate = (text) => {
  const match = STAMP.exec(String(text ?? '').trim());
  return match ? isoDate(match[1], match[2], match[3]) : null;
};
const slashDate = (text) => {
  const match = SLASH_DATE.exec(noSpace(text));
  return match ? isoDate(match[1], match[2], match[3]) : null;
};

// The attestation model of a CAT usage, so the series « 91 + letter » can be proposed: the PDF
// never prints it (« CAR DE LIGNE » is a 91 B, transport public de voyageurs).
// Other usages: the employee chooses the series.
const USAGE_MODELS = [[/CAR DE LIGNE|AUTOCAR|TRANSPORT PUBLIC DE VOYAGEURS|\bTPV\b/, 'B']];

// The rows of the form's guarantee table, always in this order (blank form of 29/10/2026).
const GUARANTEE_ROWS = [
  'Responsabilité civile',
  'Dommages collision',
  'Dommages au véhicule',
  'Incendie',
  'Vol',
  'Bris de glace',
  'Défense et recours',
  'Remorque',
  'Événement catastrophique (RC)',
  'Événement catastrophique (GA)',
];

// « SOIXANTE + CHAUFFEUR » → 60: the seats in words, as the CAT platform prints them.
const NUMBER_WORDS = {
  UN: 1,
  DEUX: 2,
  TROIS: 3,
  QUATRE: 4,
  CINQ: 5,
  SIX: 6,
  SEPT: 7,
  HUIT: 8,
  NEUF: 9,
  DIX: 10,
  ONZE: 11,
  DOUZE: 12,
  TREIZE: 13,
  QUATORZE: 14,
  QUINZE: 15,
  SEIZE: 16,
  VINGT: 20,
  VINGTS: 20,
  TRENTE: 30,
  QUARANTE: 40,
  CINQUANTE: 50,
  SOIXANTE: 60,
  CENT: 100,
};
function seatsOf(text) {
  const value = noSpace(text);
  if (/^\d{1,3}$/.test(value)) return Number(value);
  const words = String(text ?? '')
    .toUpperCase()
    .split('+')[0]
    .split(/[\s-]+/)
    .filter((w) => w && w !== 'ET');
  if (words.length === 0 || !words.every((w) => NUMBER_WORDS[w])) return null;
  // « QUATRE VINGT DIX » = 4 × 20 + 10; « SOIXANTE DIX » = 60 + 10.
  let total = 0;
  for (const word of words) {
    const n = NUMBER_WORDS[word];
    total = n === 20 && total > 0 && total < 20 ? total * 20 : total + n;
  }
  return total > 0 && total < 1000 ? total : null;
}

/** « 850000 » → « 850 000 »; the platform prints amounts without separators. */
const grouped = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** True when the text looks like a CAT platform sheet: an attestation number and its period. */
export function isCatSheet(text) {
  if (!text?.left.length || !text.right.length) return false;
  const first = text.left.find((row) => row.parts.length >= 3);
  return (
    Boolean(first) &&
    /^\d{9}$/.test(noSpace(first.parts.at(-1).text)) &&
    text.left.some((row) => row.parts.filter((p) => stampDate(p.text)).length === 2)
  );
}

export function parseCatSheet(text) {
  const fields = { insurerCode: 'CAT' };
  const set = (key, value) => {
    if (value !== null && value !== undefined && value !== '' && fields[key] === undefined) {
      fields[key] = value;
    }
  };
  const left = text.left;
  const parts = (row) => row?.parts.map((p) => p.text.trim()) ?? [];

  // Intermédiaire, police, attestation.
  const head = left.findIndex(
    (row) => row.parts.length >= 3 && /^\d{9}$/.test(noSpace(row.parts.at(-1).text)),
  );
  if (head >= 0) {
    const [intermediary, policy, number] = parts(left[head]);
    set('intermediary', intermediary);
    set('policyNumber', noSpace(policy));
    set('number', noSpace(number));
    const code = parts(left[head + 1]);
    if (code.length === 1 && /^\d{3,6}$/.test(noSpace(code[0]))) {
      set('intermediaryCode', noSpace(code[0]));
    }
  }
  // Date d'effet, expiration.
  const period = left.findIndex((row) => row.parts.filter((p) => stampDate(p.text)).length === 2);
  if (period >= 0) {
    const [from, to] = left[period].parts.map((p) => stampDate(p.text)).filter(Boolean);
    set('effectDate', from);
    set('endDate', to);
  }
  // Then, in the form's order: agrément and city, souscripteur, address, propriétaire, usage,
  // vehicle, chassis, first registration, fuel, CRM; then the guarantee table and the totals.
  const after = period >= 0 ? left.slice(period + 1) : [];
  const people = after
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.parts.length === 2 && IDENTITY.test(noSpace(row.parts[1].text)));
  // The souscripteur, then the propriétaire: the holder of the attestation is the owner.
  const owner = people[1] ?? people[0];
  if (owner) {
    const [name, identity] = parts(owner.row);
    set('holderName', name);
    set('holderIdNumber', noSpace(identity));
    const address = parts(after[people[0].i + 1]);
    if (address.length >= 1) set('holderAddress', address[0]);
    const at = owner.i + 1;
    const [usage, body] = parts(after[at]);
    set('usage', usage);
    set('bodyType', body);
    const [registration, make, type] = parts(after[at + 1]);
    set('registration', registration);
    set('makeAndType', [make, type].filter(Boolean).join(' '));
    const [vin, power] = parts(after[at + 2]);
    set('vin', vin && /^[A-Z0-9]{6,17}$/.test(noSpace(vin)) ? noSpace(vin) : null);
    if (/^\d{1,3}$/.test(noSpace(power))) set('fiscalPowerCv', Number(noSpace(power)));
    const [firstRegistration, trailer, seats] = parts(after[at + 3]);
    set('firstRegistrationDate', slashDate(firstRegistration));
    set('trailer', trailer);
    set('seats', seatsOf(seats));
    const fuelText = parts(after[at + 4]).join(' ');
    set('fuel', FUELS.find(([pattern]) => pattern.test(fuelText))?.[1]);
    const crmRow = after[at + 5];
    const crm = noSpace(crmRow?.parts[0]?.text).replace(',', '.');
    if (/^\d(\.\d{1,2})?$/.test(crm)) set('crm', crm);

    // The guarantee table: amount (left column), franchise (middle), premium (right).
    const totalsAt = after.findIndex((row) => row.parts.length >= 5 && amount(row.parts[0].text));
    const table = after.slice(at + 6, at + 6 + GUARANTEE_ROWS.length);
    const guarantees = [];
    table.forEach((row, index) => {
      if (totalsAt >= 0 && after.indexOf(row) >= totalsAt) return;
      const premiumPart = row.parts.at(-1);
      const premium = amount(premiumPart?.text);
      const others = row.parts.slice(0, -1);
      const capital = others[0] && Number(amount(others[0].text)) > 0 ? others[0].text : null;
      const rate = others[1] ? Number(noSpace(others[1].text).replace(',', '.')) : 0;
      if (!(Number(premium) > 0) && !capital) return;
      const details = [
        capital ? grouped(noSpace(capital)) : null,
        rate > 0 ? `franchise ${Math.round(rate * 1000) / 10} %` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      guarantees.push({
        label: GUARANTEE_ROWS[index],
        ...(details ? { details } : {}),
        ...(Number(premium) > 0 ? { premium } : {}),
      });
    });
    if (guarantees.length) fields.guarantees = guarantees;

    // Total prime nette, taxe parafiscale FSEC, total taxe, CNPAC, prime TTC.
    if (totalsAt >= 0) {
      const values = after[totalsAt].parts.map((p) => amount(p.text));
      if (values.length >= 5 && values.every(Boolean)) {
        const [premiumNet, fsec, taxes, cnpac, premiumTtc] = values;
        Object.assign(fields, {
          premiumNet,
          fsec,
          taxes,
          cnpac,
          totalTtc: premiumTtc,
          premiumTotal: premiumTtc,
        });
      }
    }
  }
  const model = USAGE_MODELS.find(([pattern]) => pattern.test(String(fields.usage ?? '')))?.[1];
  if (model) set('seriesCode', `91 ${model}`);

  // The attestation half: its period (« SAM 31 MAI 2025 à 00:00 »), then the place and date.
  const right = text.right.map((row) => row.text);
  const dates = right.map((row) => wordDate(row)).filter(Boolean);
  set('validFrom', dates[0] ?? fields.effectDate);
  set('validTo', dates[1] ?? fields.endDate);
  for (const row of text.right) {
    const issued = row.parts.map((p) => slashDate(p.text));
    if (row.parts.length === 2 && !issued[0] && issued[1]) {
      set('issuedAt', row.parts[0].text.trim());
      set('issuedOn', issued[1]);
    }
  }
  return fields;
}
