import { safeEqual } from '../modules/auth/tokens.js';
import { HttpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Every state-changing request must come from the application's own origin and, when a
 * session exists, carry the session's CSRF token in X-CSRF-Token. `tokenExempt` paths
 * (login) still require the Origin check.
 */
export function csrfProtection({ appOrigin, tokenExempt = [] }) {
  const exempt = new Set(tokenExempt);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    if (req.get('Origin') !== appOrigin) {
      throw new HttpError(403, 'ORIGIN_REJECTED', 'Requête refusée.');
    }
    if (
      req.auth &&
      !exempt.has(req.path) &&
      !safeEqual(req.get('X-CSRF-Token'), req.auth.csrfToken)
    ) {
      throw new HttpError(403, 'CSRF_REJECTED', 'Requête refusée. Rechargez la page.');
    }
    next();
  };
}
