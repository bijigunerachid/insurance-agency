import { BanknotesIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Skeleton, SkeletonList } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { RecordRemittanceDialog } from '../../features/remittances/RecordRemittanceDialog.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';
import { newRequestId } from '../../utils/ids.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.remittances;
const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
/** "2026-10" → "octobre 2026". */
const monthLabel = (month) => {
  const [year, number] = month.split('-').map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, number - 1, 1)));
};
const cancelled = (remittance) => remittance.status === 'CANCELLED';

const COLUMNS = [
  {
    key: 'number',
    header: t.number,
    primary: true,
    cell: (remittance) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        <TextLink to={`/reversements/${remittance.id}`} className="font-mono">
          {remittance.number}
        </TextLink>
        {cancelled(remittance) && <StatusBadge tone="warning">{t.statuses.CANCELLED}</StatusBadge>}
      </span>
    ),
  },
  { key: 'insurer', header: t.insurer, cell: (remittance) => remittance.insurer.code },
  {
    key: 'remittedOn',
    header: t.remittedOnShort,
    className: 'whitespace-nowrap',
    cell: (remittance) => formatDate(remittance.remittedOn),
  },
  {
    key: 'method',
    header: t.methodShort,
    cell: (remittance) => (
      <>
        {t.methods[remittance.method]}
        {remittance.reference && (
          <span className="block break-all text-xs text-ink-muted">{remittance.reference}</span>
        )}
      </>
    ),
  },
  {
    key: 'items',
    header: t.itemsShort,
    hideOnPhone: true,
    cell: (remittance) => t.items(remittance.itemCount),
  },
  {
    key: 'by',
    header: t.by,
    hideOnPhone: true,
    cell: (remittance) => (
      <>
        {remittance.recordedBy.displayName}
        <span className="block text-xs text-ink-muted">
          {formatDateTime(remittance.recordedAt)}
        </span>
      </>
    ),
  },
  {
    key: 'amount',
    header: t.amount,
    align: 'right',
    className: 'whitespace-nowrap font-semibold tabular-nums',
    // A cancelled remittance keeps its amount, struck through: nothing was handed over.
    cell: (remittance) => (
      <span className={cancelled(remittance) ? 'text-ink-muted line-through' : ''}>
        {formatMoney(remittance.amount)}
      </span>
    ),
  },
];

/** What is owed to each insurer per month of collection, and the remittances recorded. */
export function RemittancesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const summary = useApiQuery('/remittances/summary');
  // In one insurer's workspace: its card and its remittances only.
  const { insurer: workspace } = useInsurerFilter();
  const insurers =
    summary.state.status === 'done'
      ? summary.state.data.insurers.filter((i) => !workspace || i.id === workspace.id)
      : [];
  const [filters, setFilters] = useState({ insurerId: '', status: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  for (const key of ['insurerId', 'status']) if (filters[key]) params.set(key, filters[key]);
  if (workspace) params.set('insurerId', workspace.id);
  const history = useApiQuery(`/remittances?${params}`);
  const [dialog, setDialog] = useState(null);

  return (
    <section aria-labelledby="remittances-title" className="space-y-6">
      <PageHeader titleId="remittances-title" title={t.title} description={t.intro} />
      <WorkspaceNotice />

      {summary.state.status === 'loading' && (
        <div role="status" aria-busy="true" className="grid gap-4 lg:grid-cols-2">
          <span className="sr-only">{fr.app.loading}</span>
          {[0, 1].map((card) => (
            <div
              key={card}
              className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-hairline"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-12" />
            </div>
          ))}
        </div>
      )}
      {summary.state.status === 'error' && (
        <ErrorState
          title={errorMessage(summary.state.error)}
          body={fr.common.genericError}
          requestId={summary.state.error.requestId}
        />
      )}
      {summary.state.status === 'done' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {insurers.map((insurer) => (
            <InsurerCard
              key={insurer.id}
              insurer={insurer}
              canRecord={can('remittances.manage') && Number(insurer.total) > 0}
              onRecord={() => setDialog({ insurer, requestId: newRequestId() })}
            />
          ))}
        </div>
      )}

      <section aria-labelledby="remittances-history" className="space-y-3">
        <SectionHeading id="remittances-history" title={t.history} />
        <div className="grid gap-4 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4 md:grid-cols-[minmax(0,18rem)_1fr] md:items-end">
          {!workspace && (
            <SelectField
              label={t.insurer}
              value={filters.insurerId}
              onChange={(event) =>
                setFilters({ ...filters, insurerId: event.target.value, page: 1 })
              }
              options={[
                { value: '', label: t.allInsurers },
                ...insurers.map((i) => ({ value: i.id, label: i.name })),
              ]}
            />
          )}
          <SegmentedControl
            label={t.status}
            value={filters.status}
            onChange={(status) => setFilters({ ...filters, status, page: 1 })}
            options={[
              { value: '', label: t.allStatuses },
              ...Object.entries(t.statuses).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        {history.state.status === 'loading' && <SkeletonList rows={3} />}
        {history.state.status === 'error' && <Alert>{errorMessage(history.state.error)}</Alert>}
        {history.state.status === 'done' &&
          (history.state.data.items.length === 0 ? (
            <EmptyState icon={BanknotesIcon} title={t.none} />
          ) : (
            <>
              <DataTable caption={t.history} columns={COLUMNS} rows={history.state.data.items} />
              <Pagination
                page={history.state.data.page}
                pageCount={history.state.data.pageCount}
                total={history.state.data.total}
                onPage={(page) => setFilters({ ...filters, page })}
              />
            </>
          ))}
      </section>

      {dialog && (
        <RecordRemittanceDialog
          insurer={dialog.insurer}
          today={summary.state.data.today}
          requestId={dialog.requestId}
          onClose={() => setDialog(null)}
          onDone={(remittance) => navigate(`/reversements/${remittance.id}`)}
        />
      )}
    </section>
  );
}

/** One insurer: what is owed now, month by month with the last day to remit it. */
function InsurerCard({ insurer, canRecord, onRecord }) {
  const titleId = `remit-${insurer.code}`;
  const late = insurer.months.some((month) => month.overdue && Number(month.amount) > 0);
  return (
    <section
      aria-labelledby={titleId}
      className={`overflow-hidden rounded-card border bg-surface shadow-hairline ${
        late ? 'border-danger/40' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-4 pt-4 sm:px-5">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-section text-ink">
            {insurer.name}
          </h2>
          <p className="text-sm text-ink-muted">{t.toRemit}</p>
          <p
            className={`text-[28px] font-semibold leading-9 tabular-nums ${
              late ? 'text-danger-ink' : 'text-ink'
            }`}
          >
            {formatMoney(insurer.total)}
          </p>
        </div>
        {canRecord && <Button onClick={onRecord}>{t.record}</Button>}
      </div>
      {insurer.months.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-ink-muted sm:px-5">{t.nothing}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line text-sm">
          {insurer.months.map((month) => {
            const negative = Number(month.amount) < 0;
            return (
              <li
                key={month.month}
                className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5 ${
                  month.overdue && !negative ? 'border-l-4 border-l-danger' : ''
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-ink">
                    {t.collectedIn(monthLabel(month.month))} · {t.count(month.count)}
                  </p>
                  <p className="text-xs text-ink-muted">{t.dueOn(formatDate(month.dueOn))}</p>
                  {negative ? (
                    <p className="text-xs text-ink-soft">{t.negative}</p>
                  ) : month.overdue ? (
                    <StatusBadge tone="error">{t.late(-month.daysLeft)}</StatusBadge>
                  ) : (
                    <StatusBadge tone={month.daysLeft <= 5 ? 'warning' : 'neutral'}>
                      {t.daysLeft(month.daysLeft)}
                    </StatusBadge>
                  )}
                </div>
                <span className="font-semibold tabular-nums text-ink">
                  {formatMoney(month.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
