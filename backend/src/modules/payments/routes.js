import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { idParams, listPaymentsQuery, recordPaymentBody, reversePaymentBody } from './schemas.js';
import { createPaymentsService } from './service.js';

/** Payments received at the agency, their receipts and reversals. */
export function paymentsRoutes({ prisma, audit, clock, config, guards }) {
  const service = createPaymentsService({ prisma, audit, clock, config });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.PAYMENTS_READ);
  const recordPayment = authorize(PERMISSIONS.PAYMENTS_RECORD);
  const reverse = authorize(PERMISSIONS.PAYMENTS_REVERSE);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/contracts/:id/payments', read, async (req, res) => {
    res.json(await service.forContract(idOf(req)));
  });
  router.post('/contracts/:id/payments', recordPayment, async (req, res) => {
    const id = idOf(req);
    res
      .status(201)
      .json(await service.record(req.auth, req, id, recordPaymentBody.parse(req.body)));
  });
  router.post('/payments/:id/reverse', reverse, async (req, res) => {
    const id = idOf(req);
    res
      .status(201)
      .json(await service.reverse(req.auth, req, id, reversePaymentBody.parse(req.body)));
  });
  router.get('/payments', read, async (req, res) => {
    res.json(await service.list(listPaymentsQuery.parse(req.query)));
  });
  router.get('/payments/:id', read, async (req, res) => {
    res.json(await service.receipt(idOf(req)));
  });
  router.get('/agency', read, async (req, res) => {
    res.json(service.agency());
  });
  return router;
}
