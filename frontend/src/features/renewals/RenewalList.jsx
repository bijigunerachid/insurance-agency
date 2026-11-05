import { Link } from 'react-router';
import { PhoneLink } from '../../components/PhoneLink.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';
import { formatDate } from '../../utils/format.js';

const t = fr.renewals;

/** How close the end of the contract is: overdue in red, within a week in amber. */
export function DueBadge({ renewal }) {
  if (!renewal.open) {
    return (
      <StatusBadge tone={renewal.status === 'RENEWED' ? 'ok' : 'neutral'}>
        {t.statuses[renewal.status]}
      </StatusBadge>
    );
  }
  const tone = renewal.daysLeft < 0 ? 'error' : renewal.daysLeft <= 7 ? 'warning' : 'neutral';
  return <StatusBadge tone={tone}>{t.days(renewal.daysLeft)}</StatusBadge>;
}

/**
 * Renewal rows; each opens its follow-up page, and the client's phone calls them. `flush`:
 * inside a card, without its own border.
 */
export function RenewalList({ renewals, flush = false }) {
  return (
    <ul
      className={`divide-y divide-line bg-surface ${flush ? '' : 'overflow-hidden rounded-card border border-line shadow-hairline'}`}
    >
      {renewals.map((renewal) => (
        <li
          key={renewal.id}
          className="relative flex items-start justify-between gap-3 px-4 py-3.5 text-sm hover:bg-sunken/60 sm:px-5"
        >
          {renewal.open && renewal.daysLeft < 0 && (
            // Visual only: the badge says « En retard de N jours ».
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-danger" />
          )}
          <div className="min-w-0 space-y-0.5">
            <Link
              to={`/renouvellements/${renewal.id}`}
              className="focus-ring rounded-control font-semibold text-ink underline-offset-2 after:absolute after:inset-0 hover:text-primary hover:underline"
            >
              {renewal.contract.customer.displayName}
            </Link>
            <p className="text-ink-soft">
              <span className="font-mono">{renewal.contract.ref}</span> ·{' '}
              {renewal.contract.insurer.code} · {renewal.contract.product.name}
              {renewal.contract.vehicles.length > 0 && (
                <span className="whitespace-nowrap">
                  {' · '}
                  {renewal.contract.vehicles.map((v) => v.registration).join(', ')}
                </span>
              )}
            </p>
            <p className="text-xs text-ink-muted">
              {t.dueDate} {formatDate(renewal.dueDate)} · {t.statuses[renewal.status]} ·{' '}
              {t.assignedUser} {renewal.assignedUser.displayName}
              {renewal.noticeDeadline &&
                ` · ${t.noticeDeadline} ${formatDate(renewal.noticeDeadline)}`}
            </p>
            {renewal.open && renewal.contract.customer.phone && (
              <div className="pt-1.5">
                <PhoneLink phone={renewal.contract.customer.phone} />
              </div>
            )}
          </div>
          <span className="shrink-0">
            <DueBadge renewal={renewal} />
          </span>
        </li>
      ))}
    </ul>
  );
}
