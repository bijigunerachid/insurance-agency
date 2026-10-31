import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  assignRenewalBody,
  idParams,
  listRenewalsQuery,
  renewBody,
  updateRenewalBody,
} from './schemas.js';
import { createRenewalsService } from './service.js';

/** Renewals of issued contracts and the home dashboard summary. */
export function renewalsRoutes({ prisma, audit, clock, config, guards }) {
  const service = createRenewalsService({ prisma, audit, clock, config });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.RENEWALS_READ);
  const write = authorize(PERMISSIONS.RENEWALS_WRITE);
  const assign = authorize(PERMISSIONS.RENEWALS_ASSIGN);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/renewals', read, async (req, res) => {
    res.json(await service.list(req.auth, listRenewalsQuery.parse(req.query)));
  });
  router.get('/renewals/summary', read, async (req, res) => {
    res.json(await service.summary(req.auth));
  });
  router.get('/renewals/assignees', assign, async (req, res) => {
    res.json({ items: await service.assignees() });
  });
  router.get('/renewals/:id', read, async (req, res) => {
    res.json(await service.get(idOf(req)));
  });
  router.patch('/renewals/:id', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.update(req.auth, req, id, updateRenewalBody.parse(req.body)));
  });
  router.post('/renewals/:id/assign', assign, async (req, res) => {
    const id = idOf(req);
    res.json(await service.assign(req.auth, req, id, assignRenewalBody.parse(req.body)));
  });
  router.post('/renewals/:id/renew', write, async (req, res) => {
    const id = idOf(req);
    res.status(201).json(await service.renew(req.auth, req, id, renewBody.parse(req.body)));
  });
  return router;
}
