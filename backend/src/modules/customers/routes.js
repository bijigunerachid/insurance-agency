import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  archiveBody,
  createCustomerBody,
  customerIdParams,
  listCustomersQuery,
  restoreBody,
  revealBody,
  updateCustomerBody,
} from './schemas.js';
import { createCustomersService } from './service.js';

export function customersRoutes({ prisma, audit, clock, guards }) {
  const service = createCustomersService({ prisma, audit, clock });
  const { authorize } = guards;
  const idOf = (req) => customerIdParams.parse(req.params).id;
  const router = Router();

  router.get('/customers', authorize(PERMISSIONS.CUSTOMERS_READ), async (req, res) => {
    res.json(await service.list(req.auth, listCustomersQuery.parse(req.query)));
  });

  // Declared before /customers/:id so "assignees" is not read as an id.
  router.get('/customers/assignees', authorize(PERMISSIONS.CUSTOMERS_ASSIGN), async (req, res) => {
    res.json({ items: await service.assignees() });
  });

  router.get('/customers/:id', authorize(PERMISSIONS.CUSTOMERS_READ), async (req, res) => {
    res.json(await service.get(req.auth, idOf(req)));
  });

  router.post('/customers', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res) => {
    res.status(201).json(await service.create(req.auth, req, createCustomerBody.parse(req.body)));
  });

  router.patch('/customers/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res) => {
    const id = idOf(req);
    res.json(await service.update(req.auth, req, id, updateCustomerBody.parse(req.body)));
  });

  router.post(
    '/customers/:id/archive',
    authorize(PERMISSIONS.CUSTOMERS_ARCHIVE),
    async (req, res) => {
      const id = idOf(req);
      res.json(await service.archive(req.auth, req, id, archiveBody.parse(req.body)));
    },
  );

  router.post(
    '/customers/:id/restore',
    authorize(PERMISSIONS.CUSTOMERS_ARCHIVE),
    async (req, res) => {
      const id = idOf(req);
      res.json(await service.restore(req.auth, req, id, restoreBody.parse(req.body)));
    },
  );

  router.post(
    '/customers/:id/reveal-identity',
    authorize(PERMISSIONS.CUSTOMERS_REVEAL),
    async (req, res) => {
      const id = idOf(req);
      res.json(await service.revealIdentity(req.auth, req, id, revealBody.parse(req.body)));
    },
  );

  return router;
}
