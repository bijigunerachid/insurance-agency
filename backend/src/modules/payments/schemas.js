import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const PAYMENT_METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CARD', 'OTHER'];
/** Methods whose reference (cheque number, transfer reference, what "other" is) is required. */
export const METHODS_WITH_REFERENCE = ['CHEQUE', 'TRANSFER', 'OTHER'];

export const idParams = z.strictObject({ id: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());

/** Amount in MAD as typed: "1 234,50" or "1234.50", never a float. */
const amount = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'INVALID_AMOUNT'))
  .refine((value) => Number(value) > 0, 'AMOUNT_NOT_POSITIVE');

/** "751.55" in cents, compared without floats. */
const cents = (value) => {
  const [units, decimals = ''] = value.split('.');
  return Number(units) * 100 + Number(decimals.padEnd(2, '0'));
};

export const recordPaymentBody = z
  .strictObject({
    amount,
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(80),
    payerName: optionalText(120),
    /** Cash the customer really gave when the agency rounded (752,00 for 751,55). */
    clientPaid: amount.optional(),
    /** Cash the customer handed over (800,00 for 751,55): the receipt prints it and the change. */
    cashTendered: amount.optional(),
    idempotencyKey: z.uuid(),
  })
  .superRefine((body, ctx) => {
    if (METHODS_WITH_REFERENCE.includes(body.method) && !body.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'REQUIRED' });
    }
    if (body.cashTendered !== undefined) {
      // Change is only given in cash, and never on less than what the customer pays.
      const paid = cents(body.clientPaid ?? body.amount);
      if (body.method !== 'CASH') {
        ctx.addIssue({ code: 'custom', path: ['cashTendered'], message: 'CHANGE_CASH_ONLY' });
      } else if (cents(body.cashTendered) < paid) {
        ctx.addIssue({ code: 'custom', path: ['cashTendered'], message: 'CHANGE_BELOW_PAID' });
      }
    }
    if (body.clientPaid === undefined) return;
    // Coins are only a matter for cash; a rounding that changes nothing is not one.
    if (body.method !== 'CASH') {
      ctx.addIssue({ code: 'custom', path: ['clientPaid'], message: 'ROUNDING_CASH_ONLY' });
    } else if (Number(body.clientPaid) === Number(body.amount)) {
      ctx.addIssue({ code: 'custom', path: ['clientPaid'], message: 'ROUNDING_SAME_AMOUNT' });
    }
  });

export const reversePaymentBody = z.strictObject({
  reason: z.string().trim().min(5).max(300),
  idempotencyKey: z.uuid(),
});

export const listPaymentsQuery = z.strictObject({
  /** Agency calendar days, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  receivedById: z.uuid().optional(),
  ...paginationFields,
});
