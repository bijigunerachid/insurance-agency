import { BanknotesIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Link } from 'react-router';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { Skeleton, SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { APP_TIME_ZONE, formatDateTime, formatMoney, signedMoney } from '../../utils/format.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.payments;
const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());

const COLUMNS = [
  {
    key: 'receipt',
    header: t.receipt,
    primary: true,
    className: 'whitespace-nowrap',
    cell: (payment) => (
      <Link to={`/recus/${payment.id}`} className={`${textLinkClasses} font-mono`}>
        {payment.receiptNumber}
      </Link>
    ),
  },
  {
    key: 'customer',
    header: t.customer,
    cell: (payment) => (
      <>
        <span className="font-medium">{payment.contract.customer}</span>
        <span className="block text-xs text-ink-muted">
          <span className="font-mono">{payment.contract.ref}</span> · {payment.contract.insurer}
        </span>
        {/* The agency rounded what the client gave: the exact amount stays the payment. */}
        {payment.clientPaid && (
          <span className="block text-xs text-ink-muted">
            {t.rounded(formatMoney(payment.clientPaid), signedMoney(payment.roundingGap))}
          </span>
        )}
      </>
    ),
  },
  {
    key: 'when',
    header: t.when,
    className: 'whitespace-nowrap',
    cell: (payment) => formatDateTime(payment.receivedAt),
  },
  { key: 'method', header: t.method, cell: (payment) => t.methods[payment.method] },
  {
    key: 'by',
    header: t.by,
    hideOnPhone: true,
    cell: (payment) => payment.receivedBy.displayName,
  },
  {
    key: 'amount',
    header: t.amountShort,
    align: 'right',
    className: 'whitespace-nowrap font-semibold tabular-nums',
    cell: (payment) => formatMoney(payment.amount),
  },
];

/** The payments of a period (today by default) with their totals per method. */
export function PaymentsPage() {
  const [filters, setFilters] = useState({
    from: todayHere(),
    to: todayHere(),
    method: '',
    page: 1,
  });
  const params = new URLSearchParams({ page: String(filters.page) });
  for (const key of ['from', 'to', 'method']) if (filters[key]) params.set(key, filters[key]);
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/payments?${params}`);
  const set = (name) => (event) => setFilters({ ...filters, [name]: event.target.value, page: 1 });

  return (
    <section aria-labelledby="payments-title" className="space-y-5">
      <PageHeader title={t.title} titleId="payments-title" description={t.intro} />
      <WorkspaceNotice />
      <div className="grid gap-4 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4 lg:grid-cols-[auto_1fr] lg:items-end">
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t.from} type="date" value={filters.from} onChange={set('from')} />
          <TextField label={t.to} type="date" value={filters.to} onChange={set('to')} />
        </div>
        <SegmentedControl
          label={t.method}
          value={filters.method}
          onChange={(method) => setFilters({ ...filters, method, page: 1 })}
          options={[
            { value: '', label: t.allMethods },
            ...Object.entries(t.methods).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      {state.status === 'loading' && (
        <>
          <Totals loading />
          <SkeletonList />
        </>
      )}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && (
        <>
          <Totals data={state.data} />
          {state.data.items.length === 0 ? (
            <EmptyState icon={BanknotesIcon} title={t.none} />
          ) : (
            <>
              <DataTable caption={t.title} columns={COLUMNS} rows={state.data.items} />
              <Pagination
                page={state.data.page}
                pageCount={state.data.pageCount}
                total={state.data.total}
                onPage={(page) => setFilters({ ...filters, page })}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The period's total, then one tile per method; the cash drawer also holds the agency's
 * roundings. On a phone the total spans the row, the rest two by two.
 */
function Totals({ data, loading = false }) {
  const tile = 'min-w-0 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4';
  const label = 'text-xs text-ink-muted sm:text-sm';
  if (loading) {
    return (
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className="col-span-2 h-20 sm:col-span-1" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="hidden h-20 sm:block" />
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      <div
        className={`${tile} col-span-2 border-primary/30 bg-primary-soft sm:min-w-56 sm:flex-[1.4]`}
      >
        <dt className={label}>
          {t.total} · {t.count(data.total)}
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {formatMoney(data.totals.amount)}
        </dd>
      </div>
      {data.totals.byMethod.map((row) => (
        <div key={row.method} className={`${tile} last:even:col-span-2 sm:min-w-36 sm:flex-1`}>
          <dt className={label}>{t.methods[row.method]}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-ink">{formatMoney(row.amount)}</dd>
        </div>
      ))}
      {data.totals.roundings > 0 && (
        <div className={`${tile} last:even:col-span-2 sm:min-w-36 sm:flex-1`}>
          <dt className={label}>{t.roundings(data.totals.roundings)}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-ink">
            {signedMoney(data.totals.roundingGap)}
          </dd>
        </div>
      )}
    </dl>
  );
}
