import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { idParams, listFormsQuery, moveFormsBody, receiveBatchBody } from './schemas.js';
import { createStockService } from './service.js';

/** Blank attestation stock: batches, forms and their movements. */
export function stockRoutes({ prisma, audit, guards }) {
  const service = createStockService({ prisma, audit });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.STOCK_READ);
  const manage = authorize(PERMISSIONS.STOCK_MANAGE);
  const router = Router();

  router.get('/attestation-stock/summary', read, async (req, res) => {
    res.json(await service.summary());
  });
  router.get('/attestation-stock/holders', manage, async (req, res) => {
    res.json({ items: await service.holders() });
  });
  router.get('/attestation-batches', read, async (req, res) => {
    res.json({ items: await service.listBatches() });
  });
  router.post('/attestation-batches', manage, async (req, res) => {
    res
      .status(201)
      .json(await service.receiveBatch(req.auth, req, receiveBatchBody.parse(req.body)));
  });
  router.get('/attestation-forms', read, async (req, res) => {
    res.json(await service.listForms(listFormsQuery.parse(req.query)));
  });
  router.get('/attestation-forms/:id', read, async (req, res) => {
    res.json(await service.getForm(idParams.parse(req.params).id));
  });
  router.post('/attestation-forms/move', manage, async (req, res) => {
    res.json(await service.move(req.auth, req, moveFormsBody.parse(req.body)));
  });
  return router;
}
