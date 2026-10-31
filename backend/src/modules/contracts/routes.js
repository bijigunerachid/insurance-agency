import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  addVehicleBody,
  amendBody,
  cancelAttestationBody,
  createAttestationBody,
  createContractBody,
  idParams,
  listContractsQuery,
  removeVehicleBody,
  returnAttestationBody,
  transitionBody,
  updateContractBody,
  vehicleParams,
} from './schemas.js';
import { createContractsService } from './service.js';

/** Contracts, the vehicles they cover, their status history, attestations and avenants. */
export function contractsRoutes({ prisma, audit, clock, config, guards }) {
  const service = createContractsService({ prisma, audit, clock, config });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.CONTRACTS_READ);
  const write = authorize(PERMISSIONS.CONTRACTS_WRITE);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/contracts', read, async (req, res) => {
    res.json(await service.list(listContractsQuery.parse(req.query)));
  });
  router.get('/contracts/:id', read, async (req, res) => {
    res.json(await service.get(idOf(req)));
  });
  router.post('/contracts', write, async (req, res) => {
    res.status(201).json(await service.create(req.auth, req, createContractBody.parse(req.body)));
  });
  router.patch('/contracts/:id', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.update(req.auth, req, id, updateContractBody.parse(req.body)));
  });
  router.post('/contracts/:id/vehicles', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.addVehicle(req.auth, req, id, addVehicleBody.parse(req.body)));
  });
  router.post('/contracts/:id/vehicles/:vehicleId/remove', write, async (req, res) => {
    const { id, vehicleId } = vehicleParams.parse(req.params);
    res.json(
      await service.removeVehicle(req.auth, req, id, vehicleId, removeVehicleBody.parse(req.body)),
    );
  });
  // Suspending, reinstating or terminating an issued contract also needs contracts.terminate
  // (checked by the service, which knows the current status).
  router.post('/contracts/:id/transition', write, async (req, res) => {
    const id = idOf(req);
    res.json(await service.transition(req.auth, req, id, transitionBody.parse(req.body)));
  });
  router.post('/contracts/:id/attestations', write, async (req, res) => {
    const id = idOf(req);
    res
      .status(201)
      .json(await service.addAttestation(req.auth, req, id, createAttestationBody.parse(req.body)));
  });
  router.post('/contracts/:id/amendments', write, async (req, res) => {
    const id = idOf(req);
    res.status(201).json(await service.amend(req.auth, req, id, amendBody.parse(req.body)));
  });
  router.post('/attestations/:id/returned', write, async (req, res) => {
    const id = idOf(req);
    res.json(
      await service.returnAttestation(req.auth, req, id, returnAttestationBody.parse(req.body)),
    );
  });
  router.post('/attestations/:id/cancel', write, async (req, res) => {
    const id = idOf(req);
    res.json(
      await service.cancelAttestation(req.auth, req, id, cancelAttestationBody.parse(req.body)),
    );
  });
  return router;
}
