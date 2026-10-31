import { randomUUID } from 'node:crypto';

/**
 * Gives every request a server-generated id (never taken from the client) and logs one line
 * per request with the path only: query strings and bodies can contain personal data.
 */
export function requestContext(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    req.id = randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.setHeader('X-Request-Id', req.id);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      req.log.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        'request',
      );
    });
    next();
  };
}
