import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createDocumentStore } from './services/documentStore.js';
import { createLogger } from './services/logger.js';
import { createOcr } from './services/ocr.js';
import { createPrisma } from './services/prisma.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger({ level: config.LOG_LEVEL });
const documentStore = createDocumentStore(config.DOCUMENTS_DIR);
try {
  await documentStore.ensureReady();
} catch (err) {
  // The path is a setting, not a secret: say which folder cannot be used.
  console.error(`DOCUMENTS_DIR is not a writable folder: ${config.DOCUMENTS_DIR} (${err.code})`);
  process.exit(1);
}
const prisma = createPrisma(config.DATABASE_URL);
const ocr = createOcr({ logger });
const app = createApp({ config, logger, prisma, documentStore, ocr });

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT, env: config.NODE_ENV }, 'api started');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  const timer = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  server.close(async () => {
    await ocr.close();
    await prisma.$disconnect();
    logger.info('stopped');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
