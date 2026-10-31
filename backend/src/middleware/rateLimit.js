import { HttpError } from '../utils/httpError.js';

/**
 * Fixed-window, in-memory limiter. Enough for a single server; counts reset on restart,
 * which is acceptable because account lockout is stored in the database.
 */
export function createRateLimiter({ windowMs, max, clock }) {
  const hits = new Map();

  function take(key) {
    const now = clock.now().getTime();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  }

  // Drop expired entries now and then so memory stays bounded.
  function sweep() {
    const now = clock.now().getTime();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }

  return {
    take,
    reset: (key) => hits.delete(key),
    middleware(keyFn = (req) => req.ip) {
      return (req, res, next) => {
        if (hits.size > 10_000) sweep();
        if (!take(keyFn(req))) {
          throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives. Réessayez plus tard.');
        }
        next();
      };
    },
  };
}
