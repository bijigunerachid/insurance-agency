import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { RecordRemittanceDialog } from '../../features/remittances/RecordRemittanceDialog.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';
import { newRequestId } from '../../utils/ids.js';

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

/** What is owed to each insurer per month of collection, and the remittances recorded. */
export function RemittancesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const summary = useApiQuery('/remittances/summary');
  const [filters, setFilters] = useState({ insurerId: '', status: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  for (const key of ['insurerId', 'status']) if (filters[key]) params.set(key, filters[key]);
  const history = useApiQuery(`/remittances?${params}`);
  const [dialog, setDialog] = useState(null);
  const set = (name) => (event) => setFilters({ ...filters, [name]: event.target.value, page: 1 });

  return (
    <section aria-labelledby="remittances-title" className="space-y-6">
      <div>
        <h1 id="remittances-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>

      {summary.state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {summary.state.status === 'error' && (
        <ErrorState
          title={errorMessage(summary.state.error)}
          body={fr.common.genericError}
          requestId={summary.state.error.requestId}
        />
      )}
      {summary.state.status === 'done' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.state.data.insurers.map((insurer) => (
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
        <h2 id="remittances-history" className="text-lg font-semibold">
          {t.history}
        </h2>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <SelectField
            label={t.insurer}
            value={filters.insurerId}
            onChange={set('insurerId')}
            options={[
              { value: '', label: t.allInsurers },
              ...(summary.state.status === 'done'
                ? summary.state.data.insurers.map((i) => ({ value: i.id, label: i.name }))
                : []),
            ]}
          />
          <SelectField
            label={t.status}
            value={filters.status}
            onChange={set('status')}
            options={[
              { value: '', label: t.allStatuses },
              ...Object.entries(t.statuses).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        {history.state.status === 'loading' && <Spinner label={fr.app.loading} />}
        {history.state.status === 'error' && <Alert>{errorMessage(history.state.error)}</Alert>}
        {history.state.status === 'done' &&
          (history.state.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {t.none}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {history.state.data.items.map((remittance) => (
                  <li
                    key={remittance.id}
                    className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        <Link
                          to={`/reversements/${remittance.id}`}
                          className="font-mono text-blue-700 underline-offset-2 hover:underline"
                        >
                          {remittance.number}
                        </Link>{' '}
                        · {remittance.insurer.code} · {t.methods[remittance.method]}
                        {remittance.reference && ` · ${remittance.reference}`}
                      </p>
                      <p className="text-xs text-slate-600">
                        {formatDate(remittance.remittedOn)} · {t.items(remittance.itemCount)} ·{' '}
                        {t.by} {remittance.recordedBy.displayName} ·{' '}
                        {formatDateTime(remittance.recordedAt)}
                      </p>
                      {remittance.status === 'CANCELLED' && (
                        <StatusBadge tone="warning">{t.statuses.CANCELLED}</StatusBadge>
                      )}
                    </div>
                    <span
                      className={`font-medium tabular-nums ${remittance.status === 'CANCELLED' ? 'text-slate-500 line-through' : ''}`}
                    >
                      {formatMoney(remittance.amount)}
                    </span>
                  </li>
                ))}
              </ul>
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

function InsurerCard({ insurer, canRecord, onRecord }) {
  const titleId = `remit-${insurer.code}`;
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={titleId} className="font-semibold">
            {insurer.name}
          </h2>
          <p className="text-sm text-slate-600">
            {t.toRemit} :{' '}
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {formatMoney(insurer.total)}
            </span>
          </p>
        </div>
        {canRecord && <Button onClick={onRecord}>{t.record}</Button>}
      </div>
      {insurer.months.length === 0 ? (
        <p className="text-sm text-slate-600">{t.nothing}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {insurer.months.map((month) => (
            <li key={month.month} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="space-y-1">
                <p className="font-medium">
                  {t.collectedIn(monthLabel(month.month))} · {t.count(month.count)}
                </p>
                <p className="text-xs text-slate-600">{t.dueOn(formatDate(month.dueOn))}</p>
                {Number(month.amount) < 0 ? (
                  <StatusBadge tone="neutral">{t.negative}</StatusBadge>
                ) : month.overdue ? (
                  <StatusBadge tone="error">{t.late(-month.daysLeft)}</StatusBadge>
                ) : (
                  <StatusBadge tone={month.daysLeft <= 5 ? 'warning' : 'neutral'}>
                    {t.daysLeft(month.daysLeft)}
                  </StatusBadge>
                )}
              </div>
              <span className="font-medium tabular-nums">{formatMoney(month.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
