import { z } from 'zod';

export const PRODUCT_LINES = [
  'CAR',
  'MOTORCYCLE',
  'TAXI',
  'PASSENGER_TRANSPORT',
  'COMMERCIAL',
  'TRIPORTEUR',
  'FLEET',
  'BORDER',
  'DRIVING_SCHOOL',
];
export const RULE_STATUSES = ['LAW', 'PUBLIC', 'PRESS', 'DOCUMENT', 'UNKNOWN', 'CONFIRMED'];

export const idParams = z.strictObject({ id: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());
const version = z.int().min(1);
/** Where the information comes from: a form, a legal text, an insurer document… */
const source = text(300);

// --- Insurers ---------------------------------------------------------------

const insurerCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{2,16}$/, 'INVALID_CODE'));

export const createInsurerBody = z.strictObject({
  code: insurerCode,
  name: text(120),
  /** Rule L1: set to true to activate a third insurer anyway. */
  confirmLimit: z.boolean().optional(),
});

export const updateInsurerBody = z.strictObject({
  name: text(120).optional(),
  active: z.boolean().optional(),
  confirmLimit: z.boolean().optional(),
  version,
});

// --- Confirmation (models, usages, series, products) ------------------------

export const confirmBody = z.strictObject({
  /** The agency or insurer document that confirms the entry. */
  reference: text(200),
  version,
});

// --- Attestation models -----------------------------------------------------

/** One capital letter, as on the forms: "A" Tourisme, "P" Provisoire… */
const modelCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]$/, 'INVALID_MODEL_CODE'));

/** Number and colour fixed by arrêté 213-05, art. 2 (rule L24). */
const officialNumber = z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce.number().int().min(1).max(99).nullable().optional(),
);
const colour = optionalText(40);

export const createModelBody = z.strictObject({
  code: modelCode,
  label: text(80),
  provisional: z.boolean().default(false),
  officialNumber,
  colour,
  source,
});

/** Code and kind are fixed: series codes end with the letter, usages rely on the kind. */
export const updateModelBody = z.strictObject({
  label: text(80).optional(),
  officialNumber,
  colour,
  source: source.optional(),
  active: z.boolean().optional(),
  version,
});

// --- Vehicle usages ---------------------------------------------------------

const usageModel = z.preprocess(blankToNull, modelCode.nullable().optional());

export const createUsageBody = z.strictObject({ label: text(80), modelCode: usageModel, source });

export const updateUsageBody = z.strictObject({
  label: text(80).optional(),
  modelCode: usageModel,
  source: source.optional(),
  active: z.boolean().optional(),
  version,
});

// --- Attestation series -----------------------------------------------------

/**
 * "14A", "14 a" and "14  A" are all written "14 A", as on the forms. The number is the
 * insurer's series, the letter the attestation model.
 */
const seriesCode = z
  .string()
  .max(12)
  .transform((value) => {
    const match = /^\s*(\d{1,3})\s*([A-Za-z])\s*$/.exec(value);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : value;
  })
  .pipe(z.string().regex(/^\d{1,3} [A-Z]$/, 'INVALID_SERIES_CODE'));

/** The model of a series is configuration (owner, 23/10/2026); without one, the code's letter. */
export const createSeriesBody = z.strictObject({
  insurerId: z.uuid(),
  code: seriesCode,
  modelCode: z.preprocess(blankToNull, modelCode.nullable().optional()),
  source,
});

export const updateSeriesBody = z.strictObject({
  code: seriesCode.optional(),
  modelCode: modelCode.optional(),
  source: source.optional(),
  active: z.boolean().optional(),
  version,
});

// --- Products ---------------------------------------------------------------

const productFields = {
  line: z.enum(PRODUCT_LINES),
  name: text(120),
  insurerCode: optionalText(40),
  description: optionalText(2000),
  source,
};

export const listProductsQuery = z.strictObject({
  insurerId: z.uuid().optional(),
  line: z.enum(PRODUCT_LINES).optional(),
  status: z.enum(['TO_CONFIRM', 'CONFIRMED']).optional(),
  active: z.enum(['active', 'inactive', 'all']).default('active'),
  q: z.string().trim().max(80).optional(),
});

export const createProductBody = z.strictObject({ insurerId: z.uuid(), ...productFields });

/** The insurer cannot change: a product of another insurer is another product. */
export const updateProductBody = z.strictObject({
  line: productFields.line.optional(),
  name: productFields.name.optional(),
  insurerCode: productFields.insurerCode,
  description: productFields.description,
  source: productFields.source.optional(),
  active: z.boolean().optional(),
  version,
});

// --- Rules register ---------------------------------------------------------

export const listRulesQuery = z.strictObject({
  /** "GENERAL" = rules for every insurer (law and regulation). */
  insurer: z
    .string()
    .regex(/^(GENERAL|[A-Z0-9]{2,16})$/)
    .optional(),
  status: z.enum(RULE_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});

const ruleText = {
  statement: text(1000),
  effect: text(1000),
  source: text(400),
};

export const createRuleBody = z.strictObject({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{1,3}\d{1,4}$/, 'INVALID_RULE_CODE')),
  insurerId: z.preprocess(blankToNull, z.uuid().nullable().optional()),
  ...ruleText,
  // A new rule starts from what is known; CONFIRMED needs a review with a document reference.
  status: z.enum(RULE_STATUSES.filter((status) => status !== 'CONFIRMED')),
});

export const updateRuleBody = z.strictObject({
  statement: ruleText.statement.optional(),
  effect: ruleText.effect.optional(),
  source: ruleText.source.optional(),
  version,
});

export const reviewRuleBody = z
  .strictObject({
    status: z.enum(RULE_STATUSES),
    note: text(500),
    reference: optionalText(200),
    version,
  })
  .superRefine((body, ctx) => {
    if (body.status === 'CONFIRMED' && !body.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'REQUIRED' });
    }
  });
