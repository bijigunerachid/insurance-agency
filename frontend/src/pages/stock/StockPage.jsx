import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import {
  FormHistoryDialog,
  MoveDialog,
  ReceiveDialog,
} from '../../features/stock/StockDialogs.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate, formatDay } from '../../utils/format.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.stock;
const STATUSES = Object.keys(t.statuses);
const TONES = {
  AVAILABLE: 'ok',
  ASSIGNED: 'neutral',
  USED: 'neutral',
  RETURNED: 'neutral',
  DAMAGED: 'warning',
  LOST: 'error',
  CANCELLED: 'warning',
};
const seriesLabel = (s) => `${s.insurer.code} ${s.code}`;

/** The same query, its data passed through `pick` once loaded (reload kept). */
const withData = (query, pick) =>
  query.state.status === 'done'
    ? { ...query, state: { ...query.state, data: pick(query.state.data) } }
    : query;

export function StockPage() {
  const { can } = useAuth();
  const canManage = can('stock.manage');
  const summaryQuery = useApiQuery('/attestation-stock/summary');
  const batchesQuery = useApiQuery('/attestation-batches');
  // In one insurer's workspace: its series, batches and forms only.
  const { insurer: workspace } = useInsurerFilter();
  const ofWorkspace = (series) => !workspace || series?.insurer.id === workspace.id;
  const summary = withData(summaryQuery, (data) => ({
    ...data,
    series: data.series.filter((row) => ofWorkspace(row.series)),
    assigned: data.assigned.filter((row) => ofWorkspace(row.series)),
  }));
  const batches = withData(batchesQuery, (data) => ({
    ...data,
    items: data.items.filter((batch) => ofWorkspace(batch.series)),
  }));
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [changes, setChanges] = useState(0);
  const tracked =
    summary.state.status === 'done' ? summary.state.data.series.map((s) => s.series) : [];

  const done = (message) => {
    setDialog(null);
    setNotice(message);
    summary.reload({ silent: true });
    batches.reload({ silent: true });
    setChanges((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ type: 'receive' })}>{t.receive}</Button>
            {tracked.length > 0 && (
              <Button variant="secondary" onClick={() => setDialog({ type: 'move' })}>
                {t.move}
              </Button>
            )}
          </div>
        )}
      </div>
      <WorkspaceNotice />
      {notice && <Alert tone="info">{notice}</Alert>}

      <section aria-labelledby="summary-title" className="space-y-3">
        <h2 id="summary-title" className="text-lg font-semibold">
          {t.sections.summary}
        </h2>
        {summary.state.status === 'loading' && <Spinner label={fr.app.loading} />}
        {summary.state.status === 'error' && <Alert>{errorMessage(summary.state.error)}</Alert>}
        {summary.state.status === 'done' &&
          (summary.state.data.series.length === 0 ? (
            <p className="text-sm text-slate-600">{t.empty}</p>
          ) : (
            <>
              {/* Phones: one card per series (eight columns do not fit). */}
              <ul className="space-y-3 sm:hidden">
                {summary.state.data.series.map((row) => (
                  <li
                    key={row.series.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <p className="font-medium">
                      {seriesLabel(row.series)}
                      <span className="block text-xs font-normal text-slate-600">
                        {row.series.model.label}
                      </span>
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {STATUSES.map((status) => (
                        <div key={status} className="flex justify-between gap-2">
                          <dt className="text-slate-600">{t.statuses[status]}</dt>
                          <dd className="tabular-nums">{row.counts[status]}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-2 font-semibold">
                        <dt>{t.total}</dt>
                        <dd className="tabular-nums">{row.total}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        {t.fields.seriesId}
                      </th>
                      {STATUSES.map((status) => (
                        <th key={status} scope="col" className="px-3 py-3 text-right">
                          {t.statuses[status]}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3 text-right">
                        {t.total}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {summary.state.data.series.map((row) => (
                      <tr key={row.series.id}>
                        <th
                          scope="row"
                          className="whitespace-nowrap px-4 py-3 text-left font-medium"
                        >
                          {seriesLabel(row.series)}
                          <span className="block text-xs font-normal text-slate-600">
                            {row.series.model.label}
                          </span>
                        </th>
                        {STATUSES.map((status) => (
                          <td key={status} className="px-3 py-3 text-right tabular-nums">
                            {row.counts[status]}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}
        {summary.state.status === 'done' && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">{t.sections.assigned}</h3>
            {summary.state.data.assigned.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">{t.noAssigned}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {summary.state.data.assigned.map((row) => (
                  <li key={`${row.holder.id}-${row.series.id}`}>
                    <span className="font-medium">{row.holder.displayName}</span> ·{' '}
                    {seriesLabel(row.series)} · {row.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="batches-title" className="space-y-3">
        <h2 id="batches-title" className="text-lg font-semibold">
          {t.sections.batches}
        </h2>
        {batches.state.status === 'done' && batches.state.data.items.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {batches.state.data.items.map((batch) => (
              <li key={batch.id} className="space-y-0.5 p-3 text-sm">
                <p className="font-medium">
                  {seriesLabel(batch.series)} · {t.received(batch)}
                </p>
                <p className="text-slate-700">
                  {batch.location} · {t.fields.holderId} : {batch.holder.displayName}
                  {batch.insurerReference && ` · ${batch.insurerReference}`}
                </p>
                <p className="text-xs text-slate-600">
                  {t.receivedBy(batch.receivedBy.displayName, formatDate(batch.receivedOn))} (
                  {formatDay(batch.createdAt)})
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormSearch
        key={changes}
        tracked={tracked}
        onHistory={(formId) => setDialog({ type: 'history', formId })}
      />

      {dialog?.type === 'receive' && (
        <ReceiveDialog
          onClose={() => setDialog(null)}
          onDone={(batch) => done(t.received(batch))}
        />
      )}
      {dialog?.type === 'move' && (
        <MoveDialog
          series={tracked}
          onClose={() => setDialog(null)}
          onDone={(result) => done(t.moved(result.count))}
        />
      )}
      {dialog?.type === 'history' && (
        <FormHistoryDialog formId={dialog.formId} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function FormSearch({ tracked, onHistory }) {
  const [number, setNumber] = useState('');
  const [filters, setFilters] = useState({ q: '', seriesId: '', status: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  for (const key of ['q', 'seriesId', 'status']) if (filters[key]) params.set(key, filters[key]);
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/attestation-forms?${params}`);

  return (
    <section aria-labelledby="forms-title" className="space-y-3">
      <h2 id="forms-title" className="text-lg font-semibold">
        {t.sections.forms}
      </h2>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: number.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
      >
        <TextField
          label={t.fields.number}
          type="search"
          inputMode="numeric"
          maxLength={20}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <SelectField
          label={t.fields.seriesId}
          value={filters.seriesId}
          onChange={(e) => setFilters({ ...filters, seriesId: e.target.value, page: 1 })}
          options={[
            { value: '', label: '—' },
            ...tracked.map((s) => ({ value: s.id, label: seriesLabel(s) })),
          ]}
        />
        <SelectField
          label={t.fields.status}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          options={[
            { value: '', label: '—' },
            ...STATUSES.map((status) => ({ value: status, label: t.statuses[status] })),
          ]}
        />
        <Button type="submit" variant="secondary">
          {fr.common.search}
        </Button>
      </form>
      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'done' && state.data.items.length === 0 && (
        <p className="text-sm text-slate-600">{fr.common.empty}</p>
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {state.data.items.map((form) => (
              <li
                key={form.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <button
                    type="button"
                    onClick={() => onHistory(form.id)}
                    className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
                  >
                    {seriesLabel(form.series)} n° {form.number}
                  </button>
                  {form.holder && (
                    <span className="text-slate-600"> · {form.holder.displayName}</span>
                  )}
                  {form.contract && (
                    <>
                      {' · '}
                      <Link
                        to={`/contrats/${form.contract.id}`}
                        className="text-blue-700 underline"
                      >
                        {form.contract.ref}
                      </Link>
                    </>
                  )}
                </span>
                <StatusBadge tone={TONES[form.status]}>{t.statuses[form.status]}</StatusBadge>
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
