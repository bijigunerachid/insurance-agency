import express from 'express';
import helmet from 'helmet';
import { createGuards, loadSession } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { requestContext } from './middleware/requestContext.js';
import { auditRoutes } from './modules/audit/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { catalogueRoutes } from './modules/catalogue/routes.js';
import { contractsRoutes } from './modules/contracts/routes.js';
import { customersRoutes } from './modules/customers/routes.js';
import { documentsRoutes } from './modules/documents/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { agencyRoutes } from './modules/agency/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { paymentsRoutes } from './modules/payments/routes.js';
import { remittancesRoutes } from './modules/remittances/routes.js';
import { renewalsRoutes } from './modules/renewals/routes.js';
import { notificationsRoutes } from './modules/notifications/routes.js';
import { productionRoutes } from './modules/production/routes.js';
import { reportsRoutes } from './modules/reports/routes.js';
import { scansRoutes } from './modules/scans/routes.js';
import { stockRoutes } from './modules/stock/routes.js';
import { todayRoutes } from './modules/today/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { vehiclesRoutes } from './modules/vehicles/routes.js';
import { workspacesRoutes } from './modules/workspaces/routes.js';
import { createAuditService } from './services/audit.js';
import { activityNotifier } from './modules/notifications/activity.js';
import { createDocumentStore } from './services/documentStore.js';
import { createOcr } from './services/ocr.js';
import { systemClock } from './services/clock.js';
import { createSecretBox } from './services/secretBox.js';

export const JSON_BODY_LIMIT = '100kb';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Builds the Express app. Dependencies are passed in so tests can use a real
 * test database or a stand-in, and a controllable clock.
 */
export function createApp({
  config,
  logger,
  prisma,
  clock = systemClock,
  documentStore = createDocumentStore(config.DOCUMENTS_DIR),
  ocr = createOcr({ logger }),
}) {
  const audit = createAuditService(prisma, { onRecord: activityNotifier(clock) });
  const secretBox = createSecretBox(config.TOTP_ENCRYPTION_KEY);
  const authService = createAuthService({ prisma, audit, clock, secretBox, config });
  const guards = createGuards({ audit, clock });
  const loginLimiter = createRateLimiter({
    windowMs: LOGIN_WINDOW_MS,
    max: config.LOGIN_MAX_PER_IP,
    clock,
  });

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(requestContext(logger));
  // The API only returns JSON: forbid it from being rendered or framed as a page.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      strictTransportSecurity: config.NODE_ENV === 'production',
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // No CORS middleware on purpose: the browser app is served from the same origin,
  // so cross-origin browser requests receive no Access-Control-Allow-Origin header.
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));
  app.use(loadSession(authService));
  app.use(csrfProtection({ appOrigin: config.APP_ORIGIN, tokenExempt: ['/api/auth/login'] }));

  app.use('/api', healthRoutes({ prisma, guards, clock, config }));
  app.use('/api', agencyRoutes({ config }));
  app.use('/api/auth', authRoutes({ authService, guards, loginLimiter }));
  app.use('/api', usersRoutes({ prisma, audit, clock, guards }));
  app.use('/api', auditRoutes({ prisma, config, guards }));
  app.use('/api', customersRoutes({ prisma, audit, clock, guards }));
  app.use('/api', vehiclesRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', catalogueRoutes({ prisma, audit, clock, guards }));
  app.use('/api', contractsRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', stockRoutes({ prisma, audit, clock, guards }));
  app.use('/api', renewalsRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', paymentsRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', remittancesRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', scansRoutes({ prisma, audit, clock, config, guards, store: documentStore, ocr }));
  app.use('/api', workspacesRoutes({ prisma, config, guards }));
  app.use('/api', todayRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', reportsRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', productionRoutes({ prisma, audit, config, guards }));
  app.use('/api', notificationsRoutes({ prisma, audit, clock, config, guards }));
  app.use('/api', documentsRoutes({ prisma, audit, clock, guards, store: documentStore }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
