import { hashPassword, passwordProblems } from './passwords.js';
import { normalizeUsername, USERNAME_PATTERN } from './usernames.js';

export { USERNAME_PATTERN };

export class SetupError extends Error {
  constructor(code, details) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

/**
 * Creates an administrator from the server command line. Refuses when an active administrator
 * already exists, unless `recovery` is set (lost access); both cases are audited.
 * There is no default account and no default password.
 */
export async function createAdministrator(
  { prisma, audit },
  { username, displayName, password },
  { recovery = false } = {},
) {
  const name = normalizeUsername(username);
  const display = String(displayName ?? '').trim();
  if (!USERNAME_PATTERN.test(name)) throw new SetupError('INVALID_USERNAME');
  if (display.length < 1 || display.length > 120) throw new SetupError('INVALID_DISPLAY_NAME');
  const problems = passwordProblems(password, { username: name });
  if (problems.length > 0) throw new SetupError('WEAK_PASSWORD', problems);

  const activeAdmins = await prisma.user.count({
    where: { active: true, role: { code: 'ADMIN' } },
  });
  if (activeAdmins > 0 && !recovery) throw new SetupError('ADMIN_EXISTS');
  if (await prisma.user.findUnique({ where: { username: name } })) {
    throw new SetupError('USERNAME_TAKEN');
  }

  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const user = await tx.user.create({
      data: { username: name, displayName: display, passwordHash, roleId: role.id },
      select: { id: true, username: true },
    });
    await audit.record(
      {
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        details: { via: 'server_command', role: 'ADMIN', recovery },
      },
      tx,
    );
    return user;
  });
}
