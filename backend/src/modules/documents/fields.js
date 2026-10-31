import { z } from 'zod';

/**
 * The printed fields typed from each insurer document (forms supplied by the agency on
 * 22/10/2026, rules R10 and C12). Every field is optional: a capture can be saved in several
 * goes, and a document does not always print everything.
 */
const blankToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const text = (max) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const date = z.preprocess(blankToUndefined, z.iso.date().optional());
/** Amount in MAD as typed ("1 234,50"), kept as "1234.50". */
const money = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
    .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'INVALID_AMOUNT'))
    .transform((value) => Number(value).toFixed(2))
    .optional(),
);
/** "14p", "14 P" → "14 P": the number and the model letter, as on the form. */
const seriesCode = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^\d{1,3}[A-Z]$/, 'INVALID_SERIES_CODE'))
    .transform((value) => `${value.slice(0, -1)} ${value.slice(-1)}`)
    .optional(),
);
const serial = z.preprocess(
  blankToUndefined,
  z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{1,20}$/, 'INVALID_NUMBER'))
    .optional(),
);
const seats = z.preprocess(
  blankToUndefined,
  z.coerce.number().int('INVALID_NUMBER').min(1).max(200).optional(),
);

export const CAPTURE_FIELDS = {
  ATTESTATION: {
    seriesCode,
    number: serial,
    usage: text(80),
    holderName: text(160),
    holderIdNumber: text(32),
    holderAddress: text(200),
    policyNumber: text(40),
    intermediary: text(120),
    registration: text(20),
    vin: text(25),
    makeAndType: text(100),
    bodyType: text(60),
    seats,
    validFrom: date,
    validTo: date,
  },
  CONDITIONS_PARTICULIERES: {
    policyNumber: text(40),
    holderName: text(160),
    registration: text(20),
    effectDate: date,
    endDate: date,
    premiumNet: money,
    taxes: money,
    premiumTotal: money,
    crm: text(10),
  },
  QUITTANCE: {
    quittanceNumber: text(40),
    policyNumber: text(40),
    periodFrom: date,
    periodTo: date,
    premiumTotal: money,
  },
  NOTE_DE_COUVERTURE: {
    coverNoteNumber: text(60),
    policyNumber: text(40),
    registration: text(20),
    validFrom: date,
    validTo: date,
  },
};

/** Start and end fields of each document: the end never comes before the start. */
const PERIODS = [
  ['validFrom', 'validTo'],
  ['effectDate', 'endDate'],
  ['periodFrom', 'periodTo'],
];

export function captureFieldsSchema(type) {
  return z.strictObject(CAPTURE_FIELDS[type]).superRefine((fields, ctx) => {
    for (const [start, end] of PERIODS) {
      if (fields[start] && fields[end] && fields[end] < fields[start]) {
        ctx.addIssue({ code: 'custom', path: [end], message: 'END_BEFORE_START' });
      }
    }
  });
}

export const saveCaptureBody = z.strictObject({
  fields: z.record(z.string().max(40), z.unknown()),
  /** The capture's version; absent for the first save. */
  version: z.int().min(1).optional(),
});

/** Contract values a document can correct in one click: the insurer's document is the proof. */
export const CORRECTABLE = {
  policyNumber: 'policyNumber',
  startDate: 'startDate',
  endDate: 'endDate',
  premiumTotal: 'premiumTotal',
};

export const applyBody = z.strictObject({
  field: z.enum(Object.keys(CORRECTABLE)),
  /** The contract's version, as shown. */
  version: z.int().min(1),
});
