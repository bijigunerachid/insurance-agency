import { clearSessionCookie, setSessionCookie } from '../../middleware/auth.js';
import { csrfTokenFor } from './tokens.js';
import { changePasswordSchema, codeSchema, loginSchema, reauthSchema } from './schemas.js';

/** What the browser may know about the signed-in user. Permissions only once fully signed in. */
function describe(auth) {
  const { user } = auth;
  const { stage } = auth.session;
  return {
    authenticated: true,
    stage,
    csrfToken: auth.csrfToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: { code: user.role.code, name: user.role.name },
      twoFactorEnabled: Boolean(user.totpEnabledAt),
      permissions: stage === 'ACTIVE' ? [...auth.permissions].sort() : [],
    },
  };
}

export function createAuthController(authService) {
  // After a stage change the token rotates: send the new cookie and the matching CSRF token.
  function sendAdvance(req, res, { token, stage }) {
    setSessionCookie(res, token);
    res.json({ stage, csrfToken: csrfTokenFor(token) });
  }

  return {
    async login(req, res) {
      const body = loginSchema.parse(req.body);
      const { token, stage } = await authService.login(body, req);
      setSessionCookie(res, token);
      res.json({ stage, csrfToken: csrfTokenFor(token) });
    },

    async logout(req, res) {
      await authService.logout(req.auth.session, req);
      clearSessionCookie(res);
      res.status(204).end();
    },

    // "Not signed in" is a normal answer here, not an error: the app asks on every load.
    me(req, res) {
      res.json(req.auth ? describe(req.auth) : { authenticated: false });
    },

    async verifyTotp(req, res) {
      const { code } = codeSchema.parse(req.body);
      sendAdvance(req, res, await authService.verifySecondFactor(req.auth.session, code, req));
    },

    async changePassword(req, res) {
      const body = changePasswordSchema.parse(req.body);
      sendAdvance(req, res, await authService.changePassword(req.auth.session, body, req));
    },

    async startEnrollment(req, res) {
      res.json(await authService.startTotpEnrollment(req.auth.session));
    },

    async confirmEnrollment(req, res) {
      const { code } = codeSchema.parse(req.body);
      sendAdvance(req, res, await authService.confirmTotpEnrollment(req.auth.session, code, req));
    },

    async reauth(req, res) {
      const body = reauthSchema.parse(req.body);
      const { token, reauthValidUntil } = await authService.reauthenticate(
        req.auth.session,
        body,
        req,
      );
      setSessionCookie(res, token);
      res.json({ reauthValidUntil, csrfToken: csrfTokenFor(token) });
    },
  };
}
