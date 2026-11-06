/**
 * Writes audit events. Pass the transaction client when the event belongs to a change,
 * so the change and its audit record are committed together or not at all.
 * `details` must never contain passwords, tokens, codes or document contents.
 * `onRecord(event, client)`: run after each event in the same transaction (the team's in-app
 * activity alerts).
 */
export function createAuditService(prisma, { onRecord } = {}) {
  return {
    async record(event, client = prisma) {
      const { actorUserId = null, action, entityType, entityId, request, details } = event;
      const row = await client.auditLog.create({
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
      if (onRecord) await onRecord({ ...event, actorUserId }, client);
      return row;
    },
  };
}
