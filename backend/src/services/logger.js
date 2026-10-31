import pino from 'pino';

// Field names that must never appear in logs, at any depth we log.
export const REDACTED_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'cookie',
  '*.cookie',
  'authorization',
  '*.authorization',
  'cin',
  '*.cin',
  'headers',
  '*.headers',
];

export function createLogger({ level = 'info', destination } = {}) {
  return pino(
    {
      level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    },
    destination,
  );
}
