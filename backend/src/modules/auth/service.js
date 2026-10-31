import { HttpError } from '../../utils/httpError.js';
import {
  burnPasswordCheck,
  hashPassword,
  passwordNeedsRehash,
  passwordProblems,
  verifyPassword,
} from './passwords.js';
import { hashToken, newSessionToken } from './tokens.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';
import { auditableUsername, normalizeUsername } from './usernames.js';

export { normalizeUsername };

export const userWithRole = { include: { role: { include: { permissions: true } } } };

const PENDING_SESSION_MS = 10 * 60 * 1000;
export const REAUTH_VALID_MS = 5 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 60 * 1000;
// Throttling: from the 3rd consecutive failure, wait 1 s, 2 s, 4 s … (max 60 s) before the next
// attempt; from the 10th, every further failure locks the account for 15 minutes.
const DELAY_AFTER_FAILURES = 3;
const MAX_DELAY_SECONDS = 60;
export const LOCK_AFTER_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;
const TOTP_ISSUER = 'Agence assurances';

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
const invalidCode = () => new HttpError(401, 'INVALID_CODE', 'Code de vérification incorrect.');
const tooManyAttempts = () =>
  new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives. Réessayez plus tard.');
const UNKNOWN_USERNAMES_MAX = 10_000;

/**
 * Which step a signed-in session must complete next. Order matters: an enrolled second factor
 * is checked before anything else, so a stolen temporary password alone cannot change the
 * password or reach the application.
 */
export function computeStage(user, { totpVerified }) {
  if (user.totpEnabledAt && !totpVerified) return 'TOTP_VERIFY';
  if (user.mustChangePassword) return 'PASSWORD_CHANGE';
  if (user.role.requiresTwoFactor && !user.totpEnabledAt) return 'TOTP_ENROLL';
  return 'ACTIVE';
}

export function createAuthService({ prisma, audit, clock, secretBox, config }) {
  const idleMs = config.SESSION_IDLE_MINUTES * 60 * 1000;
  const absoluteMs = config.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;

  const expiryFor = (stage, now) =>
    new Date(now.getTime() + (stage === 'ACTIVE' ? absoluteMs : PENDING_SESSION_MS));

  function throttleState(user, now) {
    if (user.lockedUntil && user.lockedUntil > now) return 'locked';
    if (user.failedLogins >= DELAY_AFTER_FAILURES && user.lastFailedLoginAt) {
      const delaySeconds = Math.min(
        2 ** (user.failedLogins - DELAY_AFTER_FAILURES),
        MAX_DELAY_SECONDS,
      );
      if (now - user.lastFailedLoginAt < delaySeconds * 1000) return 'delayed';
    }
    return 'open';
  }

  async function assertNotThrottled(user, request) {
    const state = throttleState(user, clock.now());
    if (state === 'open') return;
    await audit.record({
      action: 'auth.throttled',
      entityType: 'user',
      entityId: user.id,
      request,
      details: { state },
    });
    throw tooManyAttempts();
  }

  /**
   * Failures for usernames that do not exist, kept in memory and throttled with the same rules
   * as real accounts, so "too many attempts" cannot reveal which usernames exist.
   */
  const unknownUsernames = new Map();

  function unknownUsernameState(name) {
    return (
      unknownUsernames.get(name) ?? { failedLogins: 0, lastFailedLoginAt: null, lockedUntil: null }
    );
  }

  function registerUnknownFailure(name) {
    const now = clock.now();
    if (unknownUsernames.size >= UNKNOWN_USERNAMES_MAX) {
      // Keep memory bounded: forget entries without a failure in the last hour, else the oldest.
      for (const [key, entry] of unknownUsernames) {
        if (now - entry.lastFailedLoginAt > 60 * 60 * 1000) unknownUsernames.delete(key);
      }
      if (unknownUsernames.size >= UNKNOWN_USERNAMES_MAX) {
        unknownUsernames.delete(unknownUsernames.keys().next().value);
      }
    }
    const previous = unknownUsernameState(name);
    const failedLogins = previous.failedLogins + 1;
    unknownUsernames.set(name, {
      failedLogins,
      lastFailedLoginAt: now,
      lockedUntil:
        failedLogins >= LOCK_AFTER_FAILURES
          ? new Date(now.getTime() + LOCK_MS)
          : previous.lockedUntil,
    });
  }

  /**
   * Marks a TOTP time step as used, atomically: if two requests present the same code at the
   * same moment, only one wins. Throws when the step was already used.
   */
  async function consumeStep(tx, userId, step) {
    const { count } = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }],
      },
      data: { totpLastStep: BigInt(step) },
    });
    if (count === 0) throw invalidCode();
  }

  /** Counts a failed password or code check against the account (atomic increment). */
  async function registerFailure(user, request, action, reason) {
    const now = clock.now();
    await prisma.$transaction(async (tx) => {
      const { failedLogins } = await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: { increment: 1 }, lastFailedLoginAt: now },
        select: { failedLogins: true },
      });
      const locked = failedLogins >= LOCK_AFTER_FAILURES;
      if (locked) {
        await tx.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
        });
      }
      await audit.record(
        {
          action,
          entityType: 'user',
          entityId: user.id,
          request,
          details: { reason, failedLogins, locked },
        },
        tx,
      );
    });
  }

  /**
   * Moves a session to its next stage with a fresh token (prevents session fixation).
   * `userData` and `extra` run in the same transaction as the audit event.
   */
  async function advance(session, user, { userData = {}, extra, action }, request) {
    const now = clock.now();
    const stage = computeStage({ ...user, ...userData }, { totpVerified: true });
    const token = newSessionToken();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { ...userData, ...(stage === 'ACTIVE' ? { lastLoginAt: now } : {}) },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          tokenHash: hashToken(token),
          stage,
          expiresAt: expiryFor(stage, now),
          pendingTotpSecret: null,
          lastSeenAt: now,
        },
      });
      if (extra) await extra(tx, now);
      await audit.record(
        {
          actorUserId: user.id,
          action,
          entityType: 'user',
          entityId: user.id,
          request,
          details: { nextStage: stage },
        },
        tx,
      );
    });
    return { token, stage };
  }

  function assertStage(session, ...stages) {
    if (!stages.includes(session.stage)) {
      throw new HttpError(403, 'STAGE_INCOMPLETE', 'Étape de connexion non autorisée.');
    }
  }

  function checkCode(user, code, secretBase32) {
    const lastUsedStep = user.totpLastStep === null ? null : Number(user.totpLastStep);
    return verifyTotp(secretBase32, code, { now: clock.now(), lastUsedStep });
  }

  return {
    async login({ username, password }, request) {
      const name = normalizeUsername(username);
      const user = await prisma.user.findUnique({ where: { username: name }, ...userWithRole });

      if (!user) {
        const state = throttleState(unknownUsernameState(name), clock.now());
        if (state !== 'open') {
          await audit.record({
            action: 'auth.throttled',
            request,
            details: { state, username: auditableUsername(name) },
          });
          throw tooManyAttempts();
        }
        await burnPasswordCheck(password);
        registerUnknownFailure(name);
        await audit.record({
          action: 'auth.login.failed',
          request,
          details: { reason: 'unknown_user', username: auditableUsername(name) },
        });
        throw invalidCredentials();
      }

      await assertNotThrottled(user, request);

      if (!(await verifyPassword(user.passwordHash, password))) {
        await registerFailure(user, request, 'auth.login.failed', 'wrong_password');
        throw invalidCredentials();
      }
      if (!user.active) {
        await audit.record({
          action: 'auth.login.failed',
          entityType: 'user',
          entityId: user.id,
          request,
          details: { reason: 'disabled' },
        });
        throw invalidCredentials();
      }

      const now = clock.now();
      const stage = computeStage(user, { totpVerified: false });
      const token = newSessionToken();
      const userData = {
        failedLogins: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        ...(stage === 'ACTIVE' ? { lastLoginAt: now } : {}),
        ...(passwordNeedsRehash(user.passwordHash)
          ? { passwordHash: await hashPassword(password) }
          : {}),
      };

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: userData });
        await tx.session.create({
          data: {
            tokenHash: hashToken(token),
            userId: user.id,
            stage,
            createdAt: now,
            lastSeenAt: now,
            expiresAt: expiryFor(stage, now),
            ip: request.ip?.slice(0, 64),
            userAgent: request.get?.('User-Agent')?.slice(0, 255),
          },
        });
        await audit.record(
          {
            actorUserId: user.id,
            action: 'auth.login.succeeded',
            entityType: 'user',
            entityId: user.id,
            request,
            details: { stage },
          },
          tx,
        );
      });
      return { token, stage };
    },

    /** Returns the live session (with user, role and permissions) or null. */
    async resolveSession(token) {
      if (!token || token.length > 128) return null;
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: userWithRole },
      });
      if (!session || session.revokedAt) return null;

      const now = clock.now();
      let reason = null;
      if (session.expiresAt <= now) reason = 'expired';
      else if (now - session.lastSeenAt > idleMs) reason = 'idle';
      else if (!session.user.active) reason = 'user_disabled';
      if (reason) {
        await prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: now, revokedReason: reason },
        });
        return null;
      }

      if (now - session.lastSeenAt > LAST_SEEN_RESOLUTION_MS) {
        await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
      }
      return session;
    },

    async logout(session, request) {
      const now = clock.now();
      await prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: now, revokedReason: 'logout' },
        });
        await audit.record(
          {
            actorUserId: session.userId,
            action: 'auth.logout',
            entityType: 'user',
            entityId: session.userId,
            request,
          },
          tx,
        );
      });
    },

    async verifySecondFactor(session, code, request) {
      assertStage(session, 'TOTP_VERIFY');
      const { user } = session;
      await assertNotThrottled(user, request);
      const step = checkCode(user, code, secretBox.decrypt(user.totpSecret));
      if (step === null) {
        await registerFailure(user, request, 'auth.totp.failed', 'wrong_code');
        throw invalidCode();
      }
      return advance(
        session,
        user,
        {
          userData: { failedLogins: 0, lastFailedLoginAt: null },
          extra: (tx) => consumeStep(tx, user.id, step),
          action: 'auth.totp.verified',
        },
        request,
      );
    },

    async changePassword(session, { currentPassword, newPassword }, request) {
      assertStage(session, 'PASSWORD_CHANGE', 'ACTIVE');
      const { user } = session;
      await assertNotThrottled(user, request);

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        await registerFailure(user, request, 'auth.password.change_failed', 'wrong_password');
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Mot de passe actuel incorrect.');
      }
      const problems = passwordProblems(newPassword, { username: user.username });
      if (newPassword === currentPassword) problems.push('SAME_AS_CURRENT');
      if (problems.length > 0) {
        throw new HttpError(400, 'WEAK_PASSWORD', 'Mot de passe refusé.', { problems });
      }

      const passwordHash = await hashPassword(newPassword);
      return advance(
        session,
        user,
        {
          userData: {
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: clock.now(),
            failedLogins: 0,
            lastFailedLoginAt: null,
          },
          // Every other session of this user ends: whoever knew the old password is signed out.
          extra: (tx, now) =>
            tx.session.updateMany({
              where: { userId: user.id, id: { not: session.id }, revokedAt: null },
              data: { revokedAt: now, revokedReason: 'password_changed' },
            }),
          action: 'auth.password.changed',
        },
        request,
      );
    },

    async startTotpEnrollment(session) {
      assertStage(session, 'TOTP_ENROLL', 'ACTIVE');
      if (session.user.totpEnabledAt) {
        throw new HttpError(
          409,
          'TOTP_ALREADY_ENABLED',
          'La double authentification est déjà active.',
        );
      }
      const secret = generateTotpSecret();
      await prisma.session.update({
        where: { id: session.id },
        data: { pendingTotpSecret: secretBox.encrypt(secret) },
      });
      return {
        secret,
        otpauthUri: otpauthUri(secret, { issuer: TOTP_ISSUER, account: session.user.username }),
      };
    },

    async confirmTotpEnrollment(session, code, request) {
      assertStage(session, 'TOTP_ENROLL', 'ACTIVE');
      const { user } = session;
      if (user.totpEnabledAt) {
        throw new HttpError(
          409,
          'TOTP_ALREADY_ENABLED',
          'La double authentification est déjà active.',
        );
      }
      if (!session.pendingTotpSecret) {
        throw new HttpError(400, 'ENROLLMENT_NOT_STARTED', "L'activation n'a pas été démarrée.");
      }
      await assertNotThrottled(user, request);
      const step = verifyTotp(secretBox.decrypt(session.pendingTotpSecret), code, {
        now: clock.now(),
      });
      if (step === null) {
        await registerFailure(user, request, 'auth.totp.enroll_failed', 'wrong_code');
        throw invalidCode();
      }
      return advance(
        session,
        user,
        {
          userData: {
            totpSecret: session.pendingTotpSecret,
            totpEnabledAt: clock.now(),
            totpLastStep: BigInt(step),
            failedLogins: 0,
            lastFailedLoginAt: null,
          },
          action: 'auth.totp.enrolled',
        },
        request,
      );
    },

    /**
     * Confirms identity again before sensitive actions (valid REAUTH_VALID_MS) and issues a new
     * session token, as after any authentication.
     */
    async reauthenticate(session, { password, code }, request) {
      assertStage(session, 'ACTIVE');
      const { user } = session;
      await assertNotThrottled(user, request);

      const passwordOk = await verifyPassword(user.passwordHash, password);
      const step = user.totpEnabledAt
        ? checkCode(user, code, secretBox.decrypt(user.totpSecret))
        : undefined;
      if (!passwordOk || step === null) {
        await registerFailure(user, request, 'auth.reauth.failed', 'wrong_credentials');
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects.');
      }

      const now = clock.now();
      const token = newSessionToken();
      await prisma.$transaction(async (tx) => {
        if (step !== undefined) await consumeStep(tx, user.id, step);
        await tx.session.update({
          where: { id: session.id },
          data: { reauthAt: now, tokenHash: hashToken(token), lastSeenAt: now },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lastFailedLoginAt: null },
        });
        await audit.record(
          {
            actorUserId: user.id,
            action: 'auth.reauth.succeeded',
            entityType: 'user',
            entityId: user.id,
            request,
          },
          tx,
        );
      });
      return { token, reauthValidUntil: new Date(now.getTime() + REAUTH_VALID_MS) };
    },
  };
}
