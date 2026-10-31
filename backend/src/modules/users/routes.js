import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { createUsersController } from './controller.js';
import { createUsersService } from './service.js';

export function usersRoutes({ prisma, audit, clock, guards }) {
  const controller = createUsersController(createUsersService({ prisma, audit, clock }));
  const { authorize, requireRecentAuth } = guards;
  const read = authorize(PERMISSIONS.USERS_READ);
  // Every change needs the permission AND a re-authentication in the last five minutes.
  const manage = [authorize(PERMISSIONS.USERS_MANAGE), requireRecentAuth];
  const router = Router();

  router.get('/roles', read, controller.roles);
  router.get('/users', read, controller.list);
  router.get('/users/:id', read, controller.get);
  router.post('/users', manage, controller.create);
  router.patch('/users/:id', manage, controller.update);
  router.post('/users/:id/disable', manage, controller.disable);
  router.post('/users/:id/enable', manage, controller.enable);
  router.post('/users/:id/reset-password', manage, controller.resetPassword);
  router.post('/users/:id/reset-two-factor', manage, controller.resetTwoFactor);
  router.post('/users/:id/unlock', manage, controller.unlock);
  router.post('/users/:id/end-sessions', manage, controller.endSessions);
  return router;
}
