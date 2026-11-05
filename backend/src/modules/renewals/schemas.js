import { z } from 'zod';
import { policyNumber } from '../contracts/schemas.js';
import { paginationFields } from '../../utils/pagination.js';

/** Statuses an employee sets by hand; RENEWED comes from the "Renouveler" action. */
export const OPEN_STATUSES = ['TO_PREPARE', 'CUSTOMER_CONTACTED', 'DOCUMENTS_COMPLETE'];

export const idParams = z.strictObject({ id: z.uuid() });

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());
const version = z.int().min(1);

export const listRenewalsQuery = z.strictObject({
  /** "open" = still to follow; otherwise one final status. */
  status: z.enum(['open', 'RENEWED', 'NOT_RENEWED', 'all']).default('open'),
  mine: z.enum(['true', 'false']).default('false'),
  /** The workspace chosen after sign-in: one insurer's renewals only. */
  insurerId: z.uuid().optional(),
  ...paginationFields,
});

export const renewalSummaryQuery = z.strictObject({ insurerId: z.uuid().optional() });

export const updateRenewalBody = z
  .strictObject({
    status: z.enum([...OPEN_STATUSES, 'NOT_RENEWED']).optional(),
    outcomeReason: optionalText(300),
    note: optionalText(300),
    version,
  })
  .superRefine((body, ctx) => {
    if (body.status === 'NOT_RENEWED' && !body.outcomeReason) {
      ctx.addIssue({ code: 'custom', path: ['outcomeReason'], message: 'REQUIRED' });
    }
    if (!body.status && !body.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'REQUIRED' });
    }
  });

export const assignRenewalBody = z.strictObject({ assignedUserId: z.uuid(), version });

/** Defaults: the same product, and the same length of cover starting the day after. */
export const renewBody = z.strictObject({
  productId: z.preprocess(blankToNull, z.uuid().nullable().optional()),
  /** Another number than last year's, when the platform gave one; else last year's is kept. */
  policyNumber: z.preprocess(blankToNull, policyNumber.nullable().optional()),
  startDate: z.preprocess(blankToNull, z.iso.date().nullable().optional()),
  endDate: z.preprocess(blankToNull, z.iso.date().nullable().optional()),
  version,
});
