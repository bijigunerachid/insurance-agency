import express, { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { MAX_DOCUMENT_BYTES, fileName } from '../documents/schemas.js';
import { DOCUMENT_TYPES } from '../../services/documentStore.js';
import {
  discardScanBody,
  fileScanBody,
  idParams,
  listScansQuery,
  matchesQuery,
  productsQuery,
} from './schemas.js';
import { createScansService } from './service.js';

/** Scanned attestations: read, checked, then filed to follow the insurance. */
export function scansRoutes({ prisma, audit, clock, config, guards, store, ocr }) {
  const service = createScansService({ prisma, audit, clock, config, store, ocr });
  const manage = guards.authorize(PERMISSIONS.SCANS_MANAGE);
  const rawFile = express.raw({ type: Object.keys(DOCUMENT_TYPES), limit: MAX_DOCUMENT_BYTES });
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.post('/scans', manage, rawFile, async (req, res) => {
    const name = fileName.parse(req.get('X-File-Name') ?? '');
    const mimeType = (req.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    res.status(201).json(await service.upload(req.auth, req, { buffer: req.body, mimeType, name }));
  });
  router.get('/scans', manage, async (req, res) => {
    res.json(await service.list(listScansQuery.parse(req.query)));
  });
  router.get('/scans/:id', manage, async (req, res) => {
    res.json(await service.get(idOf(req)));
  });
  router.get('/scans/:id/matches', manage, async (req, res) => {
    idOf(req);
    res.json(await service.matches(req.auth, matchesQuery.parse(req.query)));
  });
  router.get('/scans/:id/products', manage, async (req, res) => {
    res.json(await service.products(idOf(req), productsQuery.parse(req.query)));
  });
  router.get('/scans/:id/file', manage, async (req, res, next) => {
    const { row, stream } = await service.open(req.auth, req, idOf(req));
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Length', String(row.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    stream.on('error', next);
    stream.pipe(res);
  });
  router.post('/scans/:id/file', manage, async (req, res) => {
    const id = idOf(req);
    res.json(await service.file(req.auth, req, id, fileScanBody.parse(req.body)));
  });
  router.post('/scans/:id/discard', manage, async (req, res) => {
    const id = idOf(req);
    res.json(await service.discard(req.auth, req, id, discardScanBody.parse(req.body)));
  });
  return router;
}
