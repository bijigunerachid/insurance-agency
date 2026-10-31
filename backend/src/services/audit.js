/**
 * Writes audit events. Pass the transaction client when the event belongs to a change,
 * so the change and its audit record are committed together or not at all.
 * `details` must never contain passwords, tokens, codes or document contents.
 */
export function createAuditService(prisma) {
  return {
    record(event, client = prisma) {
      const { actorUserId = null, action, entityType, entityId, request, details } = event;
      return client.auditLog.create({
        data: {
          actorUserId,
          action,
          entityType: entityType ?? null,
          entityId: entityId ?? null,
          requestId: request?.id ?? null,
          ip: request?.ip?.slice(0, 64) ?? null,
          details: details ?? undefined,
        },
      });
    },
  };
}
