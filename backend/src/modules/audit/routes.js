import { Router } from 'express';
import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { createAuditQueryService } from './service.js';

const isoDate = z.iso.date();

const listQuery = z
  .strictObject({
    action: z
      .string()
      .regex(/^[a-z._]{1,64}$/)
      .optional(),
    actor: z.string().trim().max(64).optional(),
    entityType: z
      .string()
      .regex(/^[a-z_]{1,64}$/)
      .optional(),
    entityId: z.string().max(64).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...paginationFields,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must be before to' });

export function auditRoutes({ prisma, config, guards }) {
  const service = createAuditQueryService({ prisma, config });
  const read = guards.authorize(PERMISSIONS.AUDIT_READ);
  const router = Router();

  router.get('/audit', read, async (req, res) => {
    res.json(await service.list(listQuery.parse(req.query)));
  });
  router.get('/audit/actions', read, async (req, res) => {
    res.json({ items: await service.actions() });
  });
  return router;
}
