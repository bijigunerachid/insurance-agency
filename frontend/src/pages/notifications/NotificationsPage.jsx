import { BellIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { NotificationLine } from '../../features/notifications/NotificationBell.jsx';
import { useNotifications } from '../../features/notifications/Notifications.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';

const t = fr.notifications;

/** The history: who did what in the team, and the alerts of the day, newest first. */
export function NotificationsPage() {
  const { can } = useAuth();
  const { markSeen } = useNotifications();
  const [filters, setFilters] = useState({ kind: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.kind) params.set('kind', filters.kind);
  const { state } = useApiQuery(`/notifications?${params}`);
  const loaded = state.status === 'done';
  // Shown: seen (the « Nouveau » marks stay on this page until it is left).
  useEffect(() => {
    if (loaded) markSeen();
  }, [loaded, markSeen]);

  // Management's alerts are a choice only for those who receive them.
  const management = can('remittances.manage') || can('stock.manage');
  const kinds = Object.entries(t.kinds).filter(([value]) => value !== 'MANAGEMENT' || management);

  return (
    <section aria-labelledby="notifications-title" className="space-y-5">
      <PageHeader titleId="notifications-title" title={t.title} description={t.intro} />
      <div className="rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4">
        <SegmentedControl
          label={t.filter}
          value={filters.kind}
          onChange={(kind) => setFilters({ kind, page: 1 })}
          gridOnPhone
          options={kinds.map(([value, label]) => ({ value, label }))}
        />
      </div>
      {state.status === 'loading' && <SkeletonList />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {loaded && state.data.items.length === 0 && (
        <EmptyState icon={BellIcon} title={t.none} description={t.noneHint} />
      )}
      {loaded && state.data.items.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface p-1 shadow-hairline">
            {state.data.items.map((n) => (
              <li key={n.id} className="py-0.5">
                <NotificationLine notification={n} />
              </li>
            ))}
          </ul>
          <Pagination
            page={state.data.page}
            pageCount={state.data.pageCount}
            total={state.data.total}
            onPage={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}
    </section>
  );
}
