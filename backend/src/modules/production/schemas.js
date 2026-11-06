import { z } from 'zod';
import { PAYMENT_STATES } from '../contracts/schemas.js';

/** At most one year and one day, like the other reports. */
const MAX_DAYS = 366;

/**
 * The état de production (owner, 05/11/2026): the contracts issued in a period, dated by their
 * issue or by their effect, for one insurer or all, one employee or all (management), and what
 * the customers paid.
 */
const fields = {
  basis: z.enum(['ISSUE', 'EFFECT']).default('ISSUE'),
  from: z.iso.date(),
  to: z.iso.date(),
  insurerId: z.uuid().optional(),
  /** The employee who recorded the contracts; an agent's is always their own. */
  operatorId: z.uuid().optional(),
  payment: z.enum(PAYMENT_STATES).optional(),
};

const checkPeriod = ({ from, to }, ctx) => {
  if (to < from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'END_BEFORE_START' });
  else if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'PERIOD_TOO_LONG' });
  }
};

export const productionQuery = z.strictObject(fields).superRefine(checkPeriod);

export const productionExportQuery = z
  .strictObject({ ...fields, format: z.enum(['xlsx', 'csv']).default('xlsx') })
  .superRefine(checkPeriod);
