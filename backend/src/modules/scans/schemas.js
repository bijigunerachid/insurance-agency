import { z } from 'zod';
import { AMENDMENT_KINDS } from '../contracts/schemas.js';
import { createCustomerBody } from '../customers/schemas.js';
import { captureFieldsSchema } from '../documents/fields.js';
import { createVehicleBody } from '../vehicles/schemas.js';

export const idParams = z.strictObject({ id: z.uuid() });

export const listScansQuery = z.strictObject({
  status: z.enum(['PENDING', 'FILED', 'DISCARDED']).default('PENDING'),
});

const blankToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalText = (max) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());
const date = z.iso.date();

export const productsQuery = z.strictObject({ seriesId: z.uuid() });

export const matchesQuery = z.strictObject({
  identityNumber: optionalText(40),
  registration: optionalText(20),
  vin: optionalText(25),
  policyNumber: optionalText(40),
  /** The policy the sheet replaces (« REMPLACEMENT DE POLICE N … »). */
  replacesPolicy: optionalText(40),
  seriesId: z.preprocess(blankToUndefined, z.uuid().optional()),
  number: optionalText(20),
});

/** Each record is an existing one (its id) or a new one (the same fields as its own form). */
const existing = z.strictObject({ id: z.uuid() });

export const fileScanBody = z.strictObject({
  version: z.int().min(1),
  seriesId: z.uuid(),
  number: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{1,20}$/, 'INVALID_NUMBER')),
  validFrom: date,
  validTo: date,
  /** Printed on the attestation; issues the contract when the attestation is definitive. */
  policyNumber: optionalText(40),
  coverNoteRef: optionalText(60),
  /** The insurer's quittance (platform PDF): recorded as the proof of the issue. */
  quittanceNumber: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{6,30}$/, 'INVALID_NUMBER')
      .optional(),
  ),
  customer: z.union([existing, z.strictObject({ create: createCustomerBody })]),
  vehicle: z.union([
    // An existing vehicle; its usage may be corrected to the one the attestation prints (L16).
    // So may its insurer usage, as printed on the sheet.
    z.strictObject({
      id: z.uuid(),
      usageId: z.uuid().optional(),
      insurerUsageId: z.uuid().optional(),
    }),
    z.strictObject({ create: createVehicleBody.omit({ ownerId: true }) }),
  ]),
  contract: z.union([
    existing,
    // The next year of an existing contract: a new contract linked to it (same policy allowed).
    z.strictObject({
      renew: z.strictObject({
        id: z.uuid(),
        productId: z.preprocess(blankToUndefined, z.uuid().optional()),
        startDate: date,
        endDate: date,
        premiumTotal: optionalText(20),
      }),
    }),
    z.strictObject({
      create: z.strictObject({
        productId: z.uuid(),
        startDate: date,
        endDate: date,
        premiumTotal: optionalText(20),
      }),
    }),
  ]),
  /**
   * The sheet is an avenant on the contract (rule L28): the attestation is recorded through it.
   * Vehicle change: `previousVehicleId` is the contract's vehicle replaced (none when it was never
   * recorded). Registration change: the vehicle above keeps its place under `registration`.
   */
  amendment: z
    .strictObject({
      kind: z.enum(AMENDMENT_KINDS),
      number: z.preprocess(
        blankToUndefined,
        z
          .string()
          .regex(/^[0-9A-Z-]{1,20}$/, 'INVALID_NUMBER')
          .optional(),
      ),
      effectiveDate: date,
      amount: optionalText(20),
      previousVehicleId: z.preprocess(blankToUndefined, z.uuid().optional()),
      registration: optionalText(20),
    })
    .optional(),
  /** What the attestation prints, as checked: kept with the scan for later comparisons. */
  printed: captureFieldsSchema('ATTESTATION'),
});

export const discardScanBody = z.strictObject({
  reason: z.string().trim().min(5).max(300),
  version: z.int().min(1),
});
