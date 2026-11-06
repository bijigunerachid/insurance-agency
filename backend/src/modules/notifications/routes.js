import { Router } from 'express';
import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';
import { createNotificationsService } from './service.js';

/** The history's filter: one kind of alert, or management's two kinds together. */
const GROUPS = {
  ACTIVITY: ['ACTIVITY'],
  RENEWAL_DUE: ['RENEWAL_DUE'],
  UNPAID: ['UNPAID'],
  MANAGEMENT: ['REMITTANCE_LATE', 'STOCK_LOW'],
};
const listQuery = z.strictObject({
  kind: z.enum(Object.keys(GROUPS)).optional(),
  ...paginationFields,
});
const noQuery = z.strictObject({});

/**
 * The bell (asked every 30 seconds), the history and « seen ». Every signed-in employee: each
 * one only gets the alerts of the permissions they hold.
 */
export function notificationsRoutes({ prisma, audit, clock, config, guards }) {
  const service = createNotificationsService({ prisma, audit, clock, config });
  const signedIn = guards.requireActive;
  const router = Router();

  router.get('/notifications/summary', signedIn, async (req, res) => {
    noQuery.parse(req.query);
    res.json(await service.summary(req.auth));
  });
  router.get('/notifications', signedIn, async (req, res) => {
    const { kind, ...page } = listQuery.parse(req.query);
    res.json(await service.list(req.auth, { kind: kind ? GROUPS[kind] : undefined, ...page }));
  });
  router.post('/notifications/seen', signedIn, async (req, res) => {
    res.json(await service.markSeen(req.auth));
  });
  return router;
}
