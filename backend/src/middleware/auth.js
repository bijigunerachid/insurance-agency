import { REAUTH_VALID_MS } from '../modules/auth/service.js';
import { csrfTokenFor, SESSION_COOKIE } from '../modules/auth/tokens.js';
import { parseCookies } from '../utils/cookies.js';
import { HttpError } from '../utils/httpError.js';

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };

// No Max-Age: the cookie ends with the browser session; the server enforces the real expiry.
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

/** Attaches req.auth = { session, user, permissions, csrfToken } when the cookie is valid. */
export function loadSession(authService) {
  return async (req, res, next) => {
    req.auth = null;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return next();

    const session = await authService.resolveSession(token);
    if (!session) {
      clearSessionCookie(res);
      return next();
    }
    req.auth = {
      session,
      user: session.user,
      permissions: new Set(session.user.role.permissions.map((p) => p.permission)),
      csrfToken: csrfTokenFor(token),
    };
    next();
  };
}

/** Access guards. Every protected route uses one of these; the default is to deny. */
export function createGuards({ audit, clock }) {
  function requireStage(...stages) {
    return (req, res, next) => {
      if (!req.auth) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Veuillez vous connecter.');
      }
      if (!stages.includes(req.auth.session.stage)) {
        throw new HttpError(403, 'STAGE_INCOMPLETE', 'Terminez d’abord la connexion.');
      }
      next();
    };
  }

  const requireActive = requireStage('ACTIVE');

  function authorize(permission) {
    return async (req, res, next) => {
      requireActive(req, res, () => {});
      if (!req.auth.permissions.has(permission)) {
        await audit.record({
          actorUserId: req.auth.user.id,
          action: 'security.access_denied',
          request: req,
          details: { permission, method: req.method, path: req.path },
        });
        throw new HttpError(403, 'FORBIDDEN', 'Accès refusé.');
      }
      next();
    };
  }

  function requireRecentAuth(req, res, next) {
    requireActive(req, res, () => {});
    const { reauthAt } = req.auth.session;
    if (!reauthAt || clock.now() - reauthAt > REAUTH_VALID_MS) {
      throw new HttpError(403, 'REAUTH_REQUIRED', 'Confirmez votre identité pour continuer.');
    }
    next();
  }

  return { requireStage, requireActive, authorize, requireRecentAuth };
}
