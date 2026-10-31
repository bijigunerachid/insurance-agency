import express, { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { DOCUMENT_TYPES } from '../../services/documentStore.js';
import {
  MAX_DOCUMENT_BYTES,
  fileName,
  idParams,
  removeDocumentBody,
  uploadQuery,
} from './schemas.js';
import { createCaptureService } from './capture.js';
import { applyBody, saveCaptureBody } from './fields.js';
import { createDocumentsService } from './service.js';

/** Scans of the insurers' documents attached to contracts. */
export function documentsRoutes({ prisma, audit, clock, guards, store }) {
  const service = createDocumentsService({ prisma, audit, clock, store });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.DOCUMENTS_READ);
  const download = authorize(PERMISSIONS.DOCUMENTS_DOWNLOAD);
  const upload = authorize(PERMISSIONS.DOCUMENTS_UPLOAD);
  const remove = authorize(PERMISSIONS.DOCUMENTS_REMOVE);
  const capture = authorize(PERMISSIONS.DOCUMENTS_CAPTURE);
  const correctContract = authorize(PERMISSIONS.CONTRACTS_WRITE);
  const captures = createCaptureService({ prisma, audit, clock });
  // The file is the request body, read only for the accepted types and up to 10 MB.
  const rawFile = express.raw({ type: Object.keys(DOCUMENT_TYPES), limit: MAX_DOCUMENT_BYTES });
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  router.get('/contracts/:id/documents', read, async (req, res) => {
    res.json(await service.forContract(idOf(req)));
  });
  router.post('/contracts/:id/documents', upload, rawFile, async (req, res) => {
    const id = idOf(req);
    const query = uploadQuery.parse(req.query);
    const name = fileName.parse(req.get('X-File-Name') ?? '');
    const mimeType = (req.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    const document = await service.upload(req.auth, req, id, query, {
      buffer: req.body,
      mimeType,
      name,
    });
    res.status(201).json(document);
  });
  router.get('/documents/:id/file', download, async (req, res, next) => {
    const { row, stream } = await service.open(req.auth, req, idOf(req));
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Length', String(row.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Shown beside the capture form, inside the app's own page only.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    stream.on('error', next);
    stream.pipe(res);
  });
  router.post('/documents/:id/remove', remove, async (req, res) => {
    const id = idOf(req);
    res.json(await service.remove(req.auth, req, id, removeDocumentBody.parse(req.body)));
  });
  // What the document prints, typed beside it, and how it compares with the records.
  router.get('/documents/:id/capture', download, async (req, res) => {
    res.json(await captures.get(req.auth, idOf(req)));
  });
  router.put('/documents/:id/capture', capture, async (req, res) => {
    const id = idOf(req);
    res.json(await captures.save(req.auth, req, id, saveCaptureBody.parse(req.body)));
  });
  router.post('/documents/:id/capture/apply', capture, correctContract, async (req, res) => {
    const id = idOf(req);
    res.json(await captures.apply(req.auth, req, id, applyBody.parse(req.body)));
  });
  return router;
}
