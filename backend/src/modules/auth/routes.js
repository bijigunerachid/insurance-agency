import { Router } from 'express';
import { createAuthController } from './controller.js';

const ANY_STAGE = ['PASSWORD_CHANGE', 'TOTP_ENROLL', 'TOTP_VERIFY', 'ACTIVE'];

export function authRoutes({ authService, guards, loginLimiter }) {
  const controller = createAuthController(authService);
  const { requireStage, requireRecentAuth } = guards;
  // Adding a second factor from a signed-in session needs a fresh password check: otherwise
  // someone using an unattended session could enrol their own phone and lock the owner out.
  const recentAuthWhenActive = (req, res, next) =>
    req.auth.session.stage === 'ACTIVE' ? requireRecentAuth(req, res, next) : next();
  const router = Router();

  router.post('/login', loginLimiter.middleware(), controller.login);
  router.post('/logout', requireStage(...ANY_STAGE), controller.logout);
  router.get('/me', controller.me);
  router.post('/totp/verify', requireStage('TOTP_VERIFY'), controller.verifyTotp);
  router.post('/password', requireStage('PASSWORD_CHANGE', 'ACTIVE'), controller.changePassword);
  router.post(
    '/totp/enroll/start',
    requireStage('TOTP_ENROLL', 'ACTIVE'),
    recentAuthWhenActive,
    controller.startEnrollment,
  );
  router.post(
    '/totp/enroll/confirm',
    requireStage('TOTP_ENROLL', 'ACTIVE'),
    recentAuthWhenActive,
    controller.confirmEnrollment,
  );
  router.post('/reauth', requireStage('ACTIVE'), controller.reauth);
  return router;
}
