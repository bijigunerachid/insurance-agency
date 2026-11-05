import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const CONTRACT_STATUSES = ['DRAFT', 'AWAITING_INSURER', 'ISSUED', 'SUSPENDED', 'CANCELLED'];
export const PAYMENT_STATES = ['NONE', 'PARTIAL', 'PAID'];

export const idParams = z.strictObject({ id: z.uuid() });
export const vehicleParams = z.strictObject({ id: z.uuid(), vehicleId: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optional = (schema) => z.preprocess(blankToNull, schema.nullable().optional());
const text = (max) => z.string().trim().min(1).max(max);
const version = z.int().min(1);
const date = z.iso.date();

/** Amount in MAD as entered from the insurer's document: "1234.50", never a float. */
const amount = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'INVALID_AMOUNT'));

export const listContractsQuery = z.strictObject({
  q: z.string().trim().max(80).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  customerId: z.uuid().optional(),
  insurerId: z.uuid().optional(),
  /** Only issued contracts with something left to pay to the insurer premium. */
  unpaid: z.enum(['1']).optional(),
  /**
   * What the customer paid of the amount due (owner, 05/11/2026): nothing, part of it, all of
   * it. Only contracts sent to the insurer or issued, not cancelled, whose amount is known.
   */
  payment: z.enum(PAYMENT_STATES).optional(),
  ...paginationFields,
});

/**
 * The insurer's policy number, the contract's number in the agency (owner, 05/11/2026): as
 * printed (RMA « 663070526001509 », CAT « C2026/… »), spaces dropped, letters in capitals.
 */
export const policyNumber = z
  .string({ error: 'REQUIRED' })
  .transform((value) => value.replace(/\s/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .min(1, 'REQUIRED')
      .regex(/^[A-Z0-9][A-Z0-9/.-]{3,39}$/, 'INVALID_POLICY_NUMBER'),
  );

const contractFields = {
  productId: z.uuid(),
  startDate: date,
  endDate: date,
  premiumTotal: optional(amount),
  tacitRenewal: z.boolean().default(false),
  noticeDays: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() !== '' ? Number(value) : blankToNull(value),
    z.int().min(1).max(365).nullable().optional(),
  ),
};

export const createContractBody = z.strictObject({
  customerId: z.uuid(),
  policyNumber,
  ...contractFields,
  vehicleIds: z.array(z.uuid()).min(1).max(200),
});

/** Only a draft is edited; the customer never changes (another customer = another contract). */
export const updateContractBody = z.strictObject({
  policyNumber: policyNumber.optional(),
  productId: contractFields.productId.optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  premiumTotal: contractFields.premiumTotal,
  tacitRenewal: z.boolean().optional(),
  noticeDays: contractFields.noticeDays,
  version,
});

export const addVehicleBody = z.strictObject({ vehicleId: z.uuid(), version });
export const removeVehicleBody = z.strictObject({ version });

/**
 * One body for every status change; the service checks which fields each transition needs
 * (docs/data-model.md §3.2).
 */
export const transitionBody = z.strictObject({
  to: z.enum(CONTRACT_STATUSES),
  reason: optional(text(300)),
  /** At the issue: the number the insurer confirmed, when it differs from the one recorded. */
  policyNumber: optional(policyNumber),
  insurerReference: optional(text(120)),
  effectiveDate: optional(date),
  version,
});

/** Serial number as printed on the form: digits only, spaces ignored. */
const serialNumber = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{1,20}$/, 'INVALID_NUMBER'));

export const createAttestationBody = z.strictObject({
  vehicleId: z.uuid(),
  seriesId: z.uuid(),
  number: serialNumber,
  validFrom: date,
  validTo: date,
  medium: z.enum(['PAPER', 'ELECTRONIC']).default('PAPER'),
  coverNoteRef: optional(text(60)),
  duplicateOfId: optional(z.uuid()),
});

export const cancelAttestationBody = z.strictObject({ reason: text(200), version });
export const returnAttestationBody = z.strictObject({ version });

export const AMENDMENT_KINDS = ['VEHICLE_CHANGE', 'REGISTRATION_CHANGE'];

/**
 * An avenant the insurer issued on a running contract, with its new attestation (rule L28).
 * Vehicle change: `previousVehicleId` leaves (null when it was never recorded), `vehicleId`
 * joins. Registration change: `previousVehicleId` keeps its place under the new `registration`.
 */
export const amendBody = z.strictObject({
  kind: z.enum(AMENDMENT_KINDS),
  number: optional(
    z
      .string()
      .transform((value) => value.replace(/\s/g, '').toUpperCase())
      .pipe(z.string().regex(/^[0-9A-Z-]{1,20}$/, 'INVALID_NUMBER')),
  ),
  effectiveDate: date,
  amount: optional(amount),
  insurerReference: optional(text(120)),
  previousVehicleId: optional(z.uuid()),
  vehicleId: optional(z.uuid()),
  registration: optional(text(20)),
  attestation: z.strictObject({
    seriesId: z.uuid(),
    number: serialNumber,
    validFrom: date,
    validTo: date,
    medium: z.enum(['PAPER', 'ELECTRONIC']).default('PAPER'),
  }),
  version,
});
