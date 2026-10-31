import { z } from 'zod';
import { REPORTS } from './service.js';

/** At most one year and one day: enough for a yearly report, small enough to stay quick. */
const MAX_DAYS = 366;

export const reportParams = z.strictObject({ name: z.enum(Object.keys(REPORTS)) });

export const reportQuery = z
  .strictObject({ from: z.iso.date(), to: z.iso.date() })
  .superRefine(({ from, to }, ctx) => {
    if (to < from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'END_BEFORE_START' });
    else if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'PERIOD_TOO_LONG' });
    }
  });

export const exportQuery = reportQuery.and(z.strictObject({ format: z.enum(['csv', 'xlsx']) }));
