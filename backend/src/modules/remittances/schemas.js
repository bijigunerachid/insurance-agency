import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const REMITTANCE_METHODS = ['TRANSFER', 'CHEQUE', 'PLATFORM', 'CASH', 'OTHER'];

export const idParams = z.strictObject({ id: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());

/** Amount in MAD as shown to the user: "1 234,50" or "1234.50", never a float. */
const amount = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'INVALID_AMOUNT'));

export const outstandingQuery = z.strictObject({
  insurerId: z.uuid(),
  /** Agency day: payments received up to the end of it. */
  collectedUntil: z.iso.date(),
});

export const recordRemittanceBody = z
  .strictObject({
    insurerId: z.uuid(),
    collectedUntil: z.iso.date(),
    /** The total the user saw: refused if payments changed meanwhile. */
    expectedAmount: amount,
    method: z.enum(REMITTANCE_METHODS),
    reference: optionalText(80),
    remittedOn: z.iso.date(),
    note: optionalText(300),
    idempotencyKey: z.uuid(),
  })
  .superRefine((body, ctx) => {
    if (body.method !== 'CASH' && !body.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'REQUIRED' });
    }
  });

export const cancelRemittanceBody = z.strictObject({
  reason: z.string().trim().min(5).max(300),
});

export const listRemittancesQuery = z.strictObject({
  insurerId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  ...paginationFields,
});
