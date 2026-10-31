import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { createHealthController } from './controller.js';
import { createHealthService } from './service.js';

export function healthRoutes({ prisma, guards, clock, config }) {
  const service = createHealthService({
    prisma,
    backupStatusFile: config?.BACKUP_STATUS_FILE ?? null,
  });
  const controller = createHealthController(service, clock);
  const router = Router();
  // Public, minimal: used by Docker health checks; reveals nothing beyond up/down.
  router.get('/health', controller.live);
  router.get('/ready', controller.ready);
  // Signed-in view for the "État du système" page.
  router.get('/system/status', guards.authorize(PERMISSIONS.SYSTEM_HEALTH), controller.status);
  return router;
}
