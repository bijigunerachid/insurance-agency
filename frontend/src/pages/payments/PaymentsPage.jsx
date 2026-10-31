import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { APP_TIME_ZONE, formatDateTime, formatMoney, signedMoney } from '../../utils/format.js';

const t = fr.payments;
const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());

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
  const { state } = useApiQuery(`/payments?${params}`);
  const set = (name) => (event) => setFilters({ ...filters, [name]: event.target.value, page: 1 });

  return (
    <section aria-labelledby="payments-title" className="space-y-4">
      <div>
        <h1 id="payments-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3 sm:p-4">
        <TextField label={t.from} type="date" value={filters.from} onChange={set('from')} />
        <TextField label={t.to} type="date" value={filters.to} onChange={set('to')} />
        <SelectField
          className="col-span-2 sm:col-span-1"
          label={t.method}
          value={filters.method}
          onChange={set('method')}
          options={[
            { value: '', label: t.allMethods },
            ...Object.entries(t.methods).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && (
        <>
          {/* One block of tiles that fills its row: on a phone the total, then the rest two by two. */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm sm:flex">
            <div className="col-span-2 bg-white p-3 sm:flex-1 sm:p-4">
              <dt className="text-xs text-slate-600 sm:text-sm">
                {t.total} · {t.count(state.data.total)}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatMoney(state.data.totals.amount)}
              </dd>
            </div>
            {state.data.totals.byMethod.map((row) => (
              <div
                key={row.method}
                className="min-w-0 bg-white p-3 last:even:col-span-2 sm:flex-1 sm:p-4"
              >
                <dt className="text-xs text-slate-600 sm:text-sm">{t.methods[row.method]}</dt>
                <dd className="mt-1 font-medium tabular-nums">{formatMoney(row.amount)}</dd>
              </div>
            ))}
            {/* The cash drawer holds the amounts plus (or minus) the agency's roundings. */}
            {state.data.totals.roundings > 0 && (
              <div className="min-w-0 bg-white p-3 last:even:col-span-2 sm:flex-1 sm:p-4">
                <dt className="text-xs text-slate-600 sm:text-sm">
                  {t.roundings(state.data.totals.roundings)}
                </dt>
                <dd className="mt-1 font-medium tabular-nums">
                  {signedMoney(state.data.totals.roundingGap)}
                </dd>
              </div>
            )}
          </dl>
          {state.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {t.none}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {state.data.items.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-start justify-between gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p>
                        <Link
                          to={`/recus/${payment.id}`}
                          className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {payment.receiptNumber}
                        </Link>
                      </p>
                      <p className="font-medium">
                        {payment.contract.customer} ·{' '}
                        <span className="font-mono font-normal">{payment.contract.ref}</span> ·{' '}
                        {payment.contract.insurer}
                      </p>
                      <p className="text-xs text-slate-600">
                        {formatDateTime(payment.receivedAt)} · {t.methods[payment.method]} · {t.by}{' '}
                        {payment.receivedBy.displayName}
                      </p>
                      {payment.clientPaid && (
                        <p className="text-xs text-slate-600">
                          {t.rounded(
                            formatMoney(payment.clientPaid),
                            signedMoney(payment.roundingGap),
                          )}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(payment.amount)}
                    </span>
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
        </>
      )}
    </section>
  );
}
