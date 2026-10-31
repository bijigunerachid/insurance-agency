import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { startOfNextZonedDay, startOfZonedDay } from '../../utils/time.js';

/** Read side of the audit log (writing is services/audit.js). */
export function createAuditQueryService({ prisma, config }) {
  return {
    async list({ action, actor, entityType, entityId, from, to, page, pageSize }) {
      const at = {};
      if (from) at.gte = startOfZonedDay(from, config.APP_TIMEZONE);
      if (to) at.lt = startOfNextZonedDay(to, config.APP_TIMEZONE);
      const where = {
        ...(action ? { action: { startsWith: action } } : {}),
        ...(actor ? { actor: { username: { contains: actor.toLowerCase() } } } : {}),
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(from || to ? { at } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          orderBy: { id: 'desc' },
          ...toSkipTake({ page, pageSize }),
          include: { actor: { select: { username: true, displayName: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);
      const items = rows.map((row) => ({
        id: row.id.toString(),
        at: row.at,
        action: row.action,
        actor: row.actor,
        entityType: row.entityType,
        entityId: row.entityId,
        requestId: row.requestId,
        ip: row.ip,
        details: row.details,
      }));
      return pageResult(items, total, { page, pageSize });
    },

    async actions() {
      const rows = await prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      });
      return rows.map((row) => row.action);
    },
  };
}
