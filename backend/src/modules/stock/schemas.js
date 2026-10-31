import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const STOCK_STATUSES = [
  'AVAILABLE',
  'ASSIGNED',
  'USED',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'CANCELLED',
];
/** Largest range received or moved at once (also a CHECK on batches). */
export const MAX_RANGE = 5000;

export const idParams = z.strictObject({ id: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());

/** Serial number as printed: digits only, spaces ignored. */
const serialNumber = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{1,20}$/, 'INVALID_NUMBER'));

/** First and last serial numbers of a range: same length, in order, at most MAX_RANGE forms. */
const range = {
  seriesId: z.uuid(),
  firstNumber: serialNumber,
  lastNumber: serialNumber,
};
function checkRange(body, ctx) {
  if (body.firstNumber.length !== body.lastNumber.length) {
    ctx.addIssue({ code: 'custom', path: ['lastNumber'], message: 'SAME_LENGTH' });
    return;
  }
  const count = BigInt(body.lastNumber) - BigInt(body.firstNumber) + 1n;
  if (count < 1n) {
    ctx.addIssue({ code: 'custom', path: ['lastNumber'], message: 'RANGE_ORDER' });
  } else if (count > BigInt(MAX_RANGE)) {
    ctx.addIssue({ code: 'custom', path: ['lastNumber'], message: 'RANGE_TOO_LARGE' });
  }
}

export const receiveBatchBody = z
  .strictObject({
    ...range,
    receivedOn: z.iso.date(),
    insurerReference: optionalText(120),
    location: z.string().trim().min(1).max(120),
    holderId: z.uuid(),
  })
  .superRefine(checkRange);

/** Movements an employee records; USED and CANCELLED follow the contract's attestations. */
export const moveFormsBody = z
  .strictObject({
    ...range,
    to: z.enum(['ASSIGNED', 'AVAILABLE', 'RETURNED', 'DAMAGED', 'LOST']),
    holderId: z.preprocess(blankToNull, z.uuid().nullable().optional()),
    reason: optionalText(200),
  })
  .superRefine((body, ctx) => {
    checkRange(body, ctx);
    // Whoever keeps the forms afterwards: the employee they go to, or back in stock.
    if (['ASSIGNED', 'AVAILABLE'].includes(body.to) && !body.holderId) {
      ctx.addIssue({ code: 'custom', path: ['holderId'], message: 'REQUIRED' });
    }
    if (['RETURNED', 'DAMAGED', 'LOST'].includes(body.to) && !body.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'REQUIRED' });
    }
  });

export const listFormsQuery = z.strictObject({
  seriesId: z.uuid().optional(),
  status: z.enum(STOCK_STATUSES).optional(),
  holderId: z.uuid().optional(),
  q: z
    .string()
    .trim()
    .max(20)
    .transform((value) => value.replace(/\s/g, ''))
    .optional(),
  ...paginationFields,
});
