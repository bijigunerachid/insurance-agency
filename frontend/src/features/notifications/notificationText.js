import { fr } from '../../i18n/fr.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';

const t = fr.notifications;
const STATUS_ACTIONS = { ISSUED: 'issued', SUSPENDED: 'suspended', CANCELLED: 'cancelled' };
const renewalStatus = (status) => fr.renewals.statuses[status] ?? status;

/** What an alert says, in one sentence (the actor first for team activity). */
export function notificationText(notification, { you = false } = {}) {
  const d = notification.data;
  switch (notification.kind) {
    case 'ACTIVITY': {
      const actor = you ? t.you : (notification.actor?.displayName ?? '');
      const key =
        notification.action === 'contract.status_changed'
          ? STATUS_ACTIONS[d.to]
          : notification.action;
      const phrase = t.activity[key];
      if (!phrase) return actor;
      const extra =
        notification.action === 'renewal.updated'
          ? renewalStatus(d.to)
          : d.amount
            ? formatMoney(String(Math.abs(Number(d.amount))))
            : undefined;
      return `${actor} ${phrase(d, extra)}`;
    }
    case 'RENEWAL_DUE':
      return t.renewalDue(d);
    case 'UNPAID':
      return t.unpaid(d, formatMoney(d.balance));
    case 'REMITTANCE_LATE':
      return t.remittanceLate(d, formatMoney(d.amount));
    case 'STOCK_LOW':
      return t.stockLow(d);
    default:
      return '';
  }
}

/** The second line of a renewal alert: the last step taken, by whom and when. */
export function notificationDetail(notification) {
  const last = notification.data?.lastAction;
  if (notification.kind !== 'RENEWAL_DUE' || !last) return null;
  return t.lastAction({
    label: renewalStatus(last.status),
    note: last.note,
    by: last.by,
    when: formatDateTime(last.at),
  });
}
