import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  archiveBody,
  createFleetBody,
  createVehicleBody,
  idParams,
  listFleetsQuery,
  listVehiclesQuery,
  renameFleetBody,
  restoreBody,
  updateVehicleBody,
} from './schemas.js';
import { createVehiclesService } from './service.js';

export function vehiclesRoutes({ prisma, audit, clock, config, guards }) {
  const service = createVehiclesService({ prisma, audit, clock, config });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.VEHICLES_READ);
  const write = authorize(PERMISSIONS.VEHICLES_WRITE);
  const archive = authorize(PERMISSIONS.VEHICLES_ARCHIVE);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/vehicles', read, async (req, res) => {
    res.json(await service.list(listVehiclesQuery.parse(req.query)));
  });
  router.get('/vehicles/:id', read, async (req, res) => {
    res.json(await service.get(idOf(req)));
  });
  router.post('/vehicles', write, async (req, res) => {
    res.status(201).json(await service.create(req.auth, req, createVehicleBody.parse(req.body)));
  });
  router.patch('/vehicles/:id', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.update(req.auth, req, id, updateVehicleBody.parse(req.body)));
  });
  router.post('/vehicles/:id/archive', archive, async (req, res) => {
    const id = idOf(req);
    res.json(await service.archive(req.auth, req, id, archiveBody.parse(req.body)));
  });
  router.post('/vehicles/:id/restore', archive, async (req, res) => {
    const id = idOf(req);
    res.json(await service.restore(req.auth, req, id, restoreBody.parse(req.body)));
  });

  router.get('/fleets', read, async (req, res) => {
    const { customerId } = listFleetsQuery.parse(req.query);
    res.json({ items: await service.listFleets(customerId) });
  });
  router.post('/fleets', write, async (req, res) => {
    res.status(201).json(await service.createFleet(req.auth, req, createFleetBody.parse(req.body)));
  });
  router.patch('/fleets/:id', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.renameFleet(req.auth, req, id, renameFleetBody.parse(req.body)));
  });
  return router;
}
