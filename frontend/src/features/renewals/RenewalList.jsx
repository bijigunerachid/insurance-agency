import { PhoneIcon } from '@heroicons/react/20/solid';
import { Link } from 'react-router';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';
import { formatDate, formatPhone } from '../../utils/format.js';

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

/** Renewal rows; each opens its follow-up page, and the client's phone calls them. */
export function RenewalList({ renewals }) {
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {renewals.map((renewal) => (
        <li
          key={renewal.id}
          className="relative flex items-start justify-between gap-3 p-3 text-sm hover:bg-slate-50"
        >
          <div className="min-w-0 space-y-0.5">
            <Link
              to={`/renouvellements/${renewal.id}`}
              className="font-medium text-blue-700 underline-offset-2 after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              {renewal.contract.customer.displayName}
            </Link>
            <p className="text-slate-700">
              <span className="font-mono">{renewal.contract.ref}</span> ·{' '}
              {renewal.contract.insurer.code} · {renewal.contract.product.name}
              {renewal.contract.vehicles.length > 0 && (
                <span className="whitespace-nowrap">
                  {' · '}
                  {renewal.contract.vehicles.map((v) => v.registration).join(', ')}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600">
              {t.dueDate} {formatDate(renewal.dueDate)} · {t.statuses[renewal.status]} ·{' '}
              {t.assignedUser} {renewal.assignedUser.displayName}
              {renewal.noticeDeadline &&
                ` · ${t.noticeDeadline} ${formatDate(renewal.noticeDeadline)}`}
            </p>
            {renewal.open && renewal.contract.customer.phone && (
              <a
                href={`tel:${renewal.contract.customer.phone}`}
                className="relative mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <PhoneIcon aria-hidden="true" className="size-4" />
                {formatPhone(renewal.contract.customer.phone)}
              </a>
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
