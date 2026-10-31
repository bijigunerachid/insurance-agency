import { Writable } from 'node:stream';
import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/services/logger.js';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/none',
    APP_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'silent',
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  });
}

/** A logger that keeps every line in memory, so tests can check what was logged. */
export function memoryLogger() {
  const lines = [];
  const destination = new Writable({
    write(chunk, encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger({ level: 'trace', destination }), lines };
}
