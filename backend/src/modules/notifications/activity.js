import { displayNameOf } from '../customers/service.js';

/**
 * Team activity (owner, 05/11/2026): what a colleague just recorded, written in the same
 * transaction as the action and its audit event (a change rolled back leaves no alert). Only
 * the actions the agency follows; each alert is seen by those who may already see the record.
 */
const ACTIVITY = {
  'contract.created': { permission: 'contracts.read' },
  // The insurer's decisions only, not the internal steps.
  'contract.status_changed': {
    permission: 'contracts.read',
    when: (details) => ['ISSUED', 'SUSPENDED', 'CANCELLED'].includes(details?.to),
  },
  'payment.recorded': { permission: 'payments.read' },
  'payment.reversed': { permission: 'payments.read' },
  'renewal.updated': { permission: 'renewals.read', when: (details) => Boolean(details?.to) },
  'renewal.assigned': { permission: 'renewals.read' },
  'renewal.renewed': { permission: 'renewals.read' },
};

const customerSelect = { type: true, firstName: true, lastName: true, legalName: true };
const contractSelect = { id: true, policyNumber: true, customer: { select: customerSelect } };

/** The contract an audited action is about, and the page the alert opens. */
async function subjectOf(client, { action, entityType, entityId, details }) {
  if (entityType === 'contract') {
    const contract = await client.contract.findUnique({
      where: { id: entityId },
      select: contractSelect,
    });
    return contract && { contract, link: `/contrats/${contract.id}` };
  }
  if (entityType === 'payment') {
    const payment = await client.payment.findUnique({
      where: { id: entityId },
      select: { id: true, amount: true, contract: { select: contractSelect } },
    });
    return (
      payment && {
        contract: payment.contract,
        amount: payment.amount.toFixed(2),
        link:
          action === 'payment.recorded'
            ? `/recus/${payment.id}`
            : `/contrats/${payment.contract.id}`,
      }
    );
  }
  if (entityType === 'renewal') {
    const renewal = await client.renewal.findUnique({
      where: { id: entityId },
      select: { id: true, contract: { select: contractSelect } },
    });
    if (!renewal) return null;
    const subject = { contract: renewal.contract, link: `/renouvellements/${renewal.id}` };
    if (action === 'renewal.assigned' && details?.to) {
      const to = await client.user.findUnique({
        where: { id: details.to },
        select: { displayName: true },
      });
      subject.assignee = to?.displayName ?? null;
    }
    return subject;
  }
  return null;
}

/** The audit service's hook: `createAuditService(prisma, { onRecord: activityNotifier(clock) })`. */
export function activityNotifier(clock) {
  return async function onRecord(event, client) {
    const rule = ACTIVITY[event.action];
    if (!rule || !event.actorUserId || (rule.when && !rule.when(event.details))) return;
    const subject = await subjectOf(client, event);
    if (!subject) return;
    await client.notification.create({
      data: {
        kind: 'ACTIVITY',
        action: event.action,
        permission: rule.permission,
        actorUserId: event.actorUserId,
        entityType: event.entityType,
        entityId: event.entityId,
        link: subject.link,
        data: {
          policyNumber: subject.contract.policyNumber,
          customer: displayNameOf(subject.contract.customer),
          ...(subject.amount ? { amount: subject.amount } : {}),
          ...(event.details?.to && event.action !== 'renewal.assigned'
            ? { to: event.details.to }
            : {}),
          ...(subject.assignee ? { assignee: subject.assignee } : {}),
        },
        createdAt: clock.now(),
      },
    });
  };
}
