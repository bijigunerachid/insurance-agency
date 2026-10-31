import { randomInt } from 'node:crypto';
import { HttpError } from '../../utils/httpError.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { hashPassword, passwordProblems } from '../auth/passwords.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Ce compte a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const refuse = (code, message) => new HttpError(409, code, message);

// No 0/O, 1/l/I: easy to read aloud or copy by hand.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random temporary password such as "Kp7d-Qm3x-Ta9w-Hc2v" (about 93 bits). Shown once. */
export function generateTemporaryPassword() {
  for (;;) {
    const groups = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join(''),
    );
    const password = groups.join('-');
    if (passwordProblems(password).length === 0) return password;
  }
}

const summarySelect = {
  id: true,
  username: true,
  displayName: true,
  active: true,
  mustChangePassword: true,
  lockedUntil: true,
  totpEnabledAt: true,
  lastLoginAt: true,
  createdAt: true,
  version: true,
  role: { select: { code: true, name: true } },
};

function toSummary(user, now) {
  const { lockedUntil, totpEnabledAt, ...rest } = user;
  return {
    ...rest,
    locked: Boolean(lockedUntil && lockedUntil > now),
    twoFactorEnabled: Boolean(totpEnabledAt),
  };
}

export function createUsersService({ prisma, audit, clock }) {
  async function revokeSessions(tx, userId, reason, now) {
    const { count } = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    return count;
  }

  /** Optimistic update: succeeds only if nobody changed the account since `version` was read. */
  async function updateVersioned(tx, id, version, data) {
    const { count } = await tx.user.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      throw exists ? conflict() : notFound();
    }
  }

  /** Locks the active administrators' rows so two requests cannot remove the last one together. */
  async function assertNotLastAdmin(tx, target) {
    if (target.role.code !== 'ADMIN' || !target.active) return;
    const admins = await tx.$queryRaw`
      SELECT u.id FROM app_user u JOIN role r ON r.id = u."roleId"
      WHERE r.code = 'ADMIN' AND u.active FOR UPDATE OF u`;
    if (admins.length <= 1) {
      throw refuse('LAST_ADMIN', 'Impossible : il doit rester au moins un administrateur actif.');
    }
  }

  function assertNotSelf(actor, targetId) {
    if (actor.id === targetId) {
      throw refuse(
        'SELF_ACTION',
        'Vous ne pouvez pas faire cette action sur votre propre compte. Utilisez « Mon compte ».',
      );
    }
  }

  async function loadTarget(tx, id) {
    const user = await tx.user.findUnique({
      where: { id },
      include: { role: { select: { code: true, name: true } } },
    });
    if (!user) throw notFound();
    return user;
  }

  /** Runs an administrative change on another user in one transaction with its audit record. */
  async function adminAction({ actor, id, request, action, allowSelf = false }, change) {
    return prisma.$transaction(async (tx) => {
      if (!allowSelf) assertNotSelf(actor, id);
      const target = await loadTarget(tx, id);
      const now = clock.now();
      const { details, result } = (await change(tx, target, now)) ?? {};
      await audit.record(
        { actorUserId: actor.id, action, entityType: 'user', entityId: id, request, details },
        tx,
      );
      return result;
    });
  }

  return {
    async listRoles() {
      return prisma.role.findMany({
        select: { code: true, name: true, requiresTwoFactor: true },
        orderBy: { id: 'asc' },
      });
    },

    async list({ q, status, page, pageSize }) {
      const where = {
        ...(status === 'all' ? {} : { active: status === 'active' }),
        ...(q
          ? {
              OR: [
                { username: { contains: q.toLowerCase() } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          select: summarySelect,
          orderBy: [{ active: 'desc' }, { username: 'asc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.user.count({ where }),
      ]);
      const now = clock.now();
      return pageResult(
        rows.map((row) => toSummary(row, now)),
        total,
        { page, pageSize },
      );
    },

    async get(id) {
      const user = await prisma.user.findUnique({ where: { id }, select: summarySelect });
      if (!user) throw notFound();
      const activeSessions = await prisma.session.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: clock.now() } },
      });
      return { ...toSummary(user, clock.now()), activeSessions };
    },

    async create({ actor, request }, { username, displayName, roleCode }) {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = await prisma.$transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
          throw refuse('USERNAME_TAKEN', 'Cet identifiant est déjà utilisé.');
        }
        const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode } });
        const created = await tx.user.create({
          data: { username, displayName, roleId: role.id, passwordHash, mustChangePassword: true },
          select: { id: true },
        });
        await audit.record(
          {
            actorUserId: actor.id,
            action: 'user.created',
            entityType: 'user',
            entityId: created.id,
            request,
            details: { via: 'administration', role: roleCode },
          },
          tx,
        );
        return created;
      });
      // The temporary password is returned once and never stored or logged in clear.
      return { user: await this.get(user.id), temporaryPassword };
    },

    async update({ actor, request }, id, { displayName, roleCode, version }) {
      const isSelf = actor.id === id;
      if (isSelf && roleCode !== undefined) {
        throw refuse('SELF_ACTION', 'Vous ne pouvez pas changer votre propre rôle.');
      }
      await adminAction(
        { actor, id, request, action: 'user.updated', allowSelf: true },
        async (tx, target, now) => {
          const changes = {};
          const data = {};
          if (displayName !== undefined && displayName !== target.displayName) {
            data.displayName = displayName;
            changes.displayName = true;
          }
          if (roleCode !== undefined && roleCode !== target.role.code) {
            if (target.role.code === 'ADMIN') await assertNotLastAdmin(tx, target);
            const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode } });
            data.roleId = role.id;
            changes.role = { from: target.role.code, to: roleCode };
          }
          await updateVersioned(tx, id, version, data);
          // A role change ends the user's sessions: new rights start with a fresh sign-in.
          const sessionsEnded = changes.role
            ? await revokeSessions(tx, id, 'role_changed', now)
            : 0;
          return { details: { changes, sessionsEnded } };
        },
      );
      return this.get(id);
    },

    async disable({ actor, request }, id, { version }) {
      await adminAction(
        { actor, id, request, action: 'user.disabled' },
        async (tx, target, now) => {
          await assertNotLastAdmin(tx, target);
          await updateVersioned(tx, id, version, { active: false });
          return { details: { sessionsEnded: await revokeSessions(tx, id, 'user_disabled', now) } };
        },
      );
      return this.get(id);
    },

    async enable({ actor, request }, id, { version }) {
      await adminAction({ actor, id, request, action: 'user.enabled' }, async (tx) => {
        await updateVersioned(tx, id, version, {
          active: true,
          failedLogins: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        });
      });
      return this.get(id);
    },

    async resetPassword({ actor, request }, id, { version }) {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await adminAction(
        { actor, id, request, action: 'user.password_reset' },
        async (tx, target, now) => {
          await updateVersioned(tx, id, version, {
            passwordHash,
            mustChangePassword: true,
            passwordChangedAt: now,
            failedLogins: 0,
            lastFailedLoginAt: null,
            lockedUntil: null,
          });
          return {
            details: { sessionsEnded: await revokeSessions(tx, id, 'password_reset', now) },
          };
        },
      );
      return { user: await this.get(id), temporaryPassword };
    },

    async resetTwoFactor({ actor, request }, id, { version }) {
      await adminAction(
        { actor, id, request, action: 'user.two_factor_reset' },
        async (tx, target, now) => {
          await updateVersioned(tx, id, version, {
            totpSecret: null,
            totpEnabledAt: null,
            totpLastStep: null,
          });
          return {
            details: { sessionsEnded: await revokeSessions(tx, id, 'two_factor_reset', now) },
          };
        },
      );
      return this.get(id);
    },

    async unlock({ actor, request }, id, { version }) {
      await adminAction({ actor, id, request, action: 'user.unlocked' }, async (tx) => {
        await updateVersioned(tx, id, version, {
          failedLogins: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        });
      });
      return this.get(id);
    },

    async endSessions({ actor, request }, id) {
      await adminAction(
        { actor, id, request, action: 'user.sessions_ended' },
        async (tx, target, now) => ({
          details: { sessionsEnded: await revokeSessions(tx, id, 'ended_by_admin', now) },
        }),
      );
      return this.get(id);
    },
  };
}
