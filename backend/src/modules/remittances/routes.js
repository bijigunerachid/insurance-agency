import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  cancelRemittanceBody,
  idParams,
  listRemittancesQuery,
  outstandingQuery,
  recordRemittanceBody,
} from './schemas.js';
import { createRemittancesService } from './service.js';

/** Premiums collected at the agency and paid over to the insurers (rule L5). */
export function remittancesRoutes({ prisma, audit, clock, config, guards }) {
  const service = createRemittancesService({ prisma, audit, clock, config });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.REMITTANCES_READ);
  const manage = authorize(PERMISSIONS.REMITTANCES_MANAGE);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/remittances/summary', read, async (req, res) => {
    res.json(await service.summary());
  });
  router.get('/remittances/outstanding', read, async (req, res) => {
    res.json(await service.outstanding(outstandingQuery.parse(req.query)));
  });
  router.get('/remittances', read, async (req, res) => {
    res.json(await service.list(listRemittancesQuery.parse(req.query)));
  });
  router.post('/remittances', manage, async (req, res) => {
    res.status(201).json(await service.record(req.auth, req, recordRemittanceBody.parse(req.body)));
  });
  router.get('/remittances/:id', read, async (req, res) => {
    res.json(await service.get(idOf(req)));
  });
  router.post('/remittances/:id/cancel', manage, async (req, res) => {
    const id = idOf(req);
    res.json(await service.cancel(req.auth, req, id, cancelRemittanceBody.parse(req.body)));
  });
  return router;
}
