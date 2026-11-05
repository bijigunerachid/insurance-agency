import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { RenewalList } from '../../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.renewals;
/** The renewal window (30 days); shown in the introduction. */
const WINDOW_DAYS = 30;

export function RenewalsPage() {
  const [filters, setFilters] = useState({ status: 'open', mine: false, page: 1 });
  const params = new URLSearchParams({ status: filters.status, page: String(filters.page) });
  if (filters.mine) params.set('mine', 'true');
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/renewals?${params}`);

  return (
    <section aria-labelledby="renewals-title" className="space-y-5">
      <PageHeader title={t.title} titleId="renewals-title" description={t.intro(WINDOW_DAYS)} />
      <WorkspaceNotice />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4">
        <SegmentedControl
          label={t.statusLabel}
          value={filters.status}
          onChange={(status) => setFilters({ ...filters, status, page: 1 })}
          options={Object.entries(t.filters).map(([value, label]) => ({ value, label }))}
        />
        <label className="flex cursor-pointer items-center gap-2.5 pb-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={filters.mine}
            onChange={(e) => setFilters({ ...filters, mine: e.target.checked, page: 1 })}
            className="size-4 rounded accent-primary"
          />
          {t.mineLabel}
        </label>
      </div>
      {state.status === 'loading' && <SkeletonList />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState
          icon={ArrowPathIcon}
          title={t.none}
          description={filters.status === 'open' && !filters.mine ? t.noneOpen : undefined}
        />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <RenewalList renewals={state.data.items} />
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
