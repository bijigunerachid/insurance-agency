import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Ressource introuvable.', requestId: req.id },
  });
}

/**
 * Turns any error into a safe JSON response. Internal details (stack, SQL, file paths)
 * go to the log only.
 */
// Express needs the 4-argument signature to recognise an error handler.
export function errorHandler(err, req, res, _next) {
  const { status, body } = toResponse(err);
  if (status >= 500) {
    req.log.error({ err }, 'unhandled error');
  } else {
    req.log.warn({ code: body.code, status }, 'request rejected');
  }
  res.status(status).json({ error: { ...body, requestId: req.id } });
}

function toResponse(err) {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: { code: err.code, message: err.message, details: err.details },
    };
  }
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        // Field paths and rule codes only, never the submitted values.
        // Our own rule names (UPPER_SNAKE, e.g. INVALID_PHONE) replace Zod's generic codes.
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          rule: /^[A-Z_]+$/.test(issue.message) ? issue.message : issue.code,
        })),
      },
    };
  }
  // Errors raised by Express's JSON body parser.
  if (err?.type === 'entity.too.large') {
    return {
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' },
    };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'INVALID_JSON', message: 'Format de requête invalide.' } };
  }
  // Prisma P2028: no database transaction could start or finish in time; or every connection of
  // the pool stayed busy past its limit (services/prisma.js). The server is overloaded and
  // nothing was saved: the user can safely try again.
  if (
    err?.code === 'P2028' ||
    /timeout exceeded when trying to connect/i.test(err?.message ?? '')
  ) {
    return {
      status: 503,
      body: { code: 'SERVER_BUSY', message: 'Le serveur est occupé. Réessayez dans un instant.' },
    };
  }
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' } };
}
