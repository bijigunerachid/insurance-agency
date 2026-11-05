import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink, textLinkClasses } from '../../components/TextLink.jsx';
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
/** One white block whose rows are divided (batches, forms, people holding forms). */
const listClasses =
  'divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-sm shadow-hairline';

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
    <div className="space-y-8">
      <PageHeader
        title={t.title}
        description={t.intro}
        actions={
          canManage && (
            <>
              <Button onClick={() => setDialog({ type: 'receive' })}>{t.receive}</Button>
              {tracked.length > 0 && (
                <Button variant="secondary" onClick={() => setDialog({ type: 'move' })}>
                  {t.move}
                </Button>
              )}
            </>
          )
        }
      />
      {(notice || workspace) && (
        <div className="space-y-3">
          <WorkspaceNotice />
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      <section aria-labelledby="summary-title" className="space-y-3">
        <SectionHeading id="summary-title" title={t.sections.summary} />
        {summary.state.status === 'loading' && <SkeletonList rows={3} />}
        {summary.state.status === 'error' && <Alert>{errorMessage(summary.state.error)}</Alert>}
        {summary.state.status === 'done' &&
          (summary.state.data.series.length === 0 ? (
            <EmptyState compact title={t.empty} />
          ) : (
            <>
              {/* Phones: one card per series (eight columns do not fit). */}
              <ul className="space-y-3 sm:hidden">
                {summary.state.data.series.map((row) => (
                  <li
                    key={row.series.id}
                    className="rounded-card border border-line bg-surface p-4 shadow-hairline"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">
                        {seriesLabel(row.series)}
                        <span className="block text-xs font-normal text-ink-muted">
                          {row.series.model.label}
                        </span>
                      </p>
                      {/* What can be given out today: the number to read first. */}
                      <p className="text-right">
                        <span className="block text-2xl font-semibold tabular-nums text-success-ink">
                          {row.counts.AVAILABLE}
                        </span>
                        <span className="text-xs text-ink-muted">{t.statuses.AVAILABLE}</span>
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
                      {STATUSES.filter((status) => status !== 'AVAILABLE').map((status) => (
                        <div key={status} className="flex justify-between gap-2">
                          <dt className="text-ink-muted">{t.statuses[status]}</dt>
                          <dd className="tabular-nums text-ink">{row.counts[status]}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-2 font-semibold text-ink">
                        <dt>{t.total}</dt>
                        <dd className="tabular-nums">{row.total}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-line bg-surface shadow-hairline sm:block">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-line bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">
                        {t.fields.seriesId}
                      </th>
                      {STATUSES.map((status) => (
                        <th key={status} scope="col" className="px-3 py-2.5 text-right">
                          {t.statuses[status]}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-2.5 text-right">
                        {t.total}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {summary.state.data.series.map((row) => (
                      <tr key={row.series.id} className="hover:bg-canvas/60">
                        <th
                          scope="row"
                          className="whitespace-nowrap px-4 py-3 text-left font-semibold text-ink"
                        >
                          {seriesLabel(row.series)}
                          <span className="block text-xs font-normal text-ink-muted">
                            {row.series.model.label}
                          </span>
                        </th>
                        {STATUSES.map((status) => (
                          <td
                            key={status}
                            className={`px-3 py-3 text-right tabular-nums ${
                              status === 'AVAILABLE'
                                ? 'font-semibold text-success-ink'
                                : row.counts[status]
                                  ? 'text-ink'
                                  : 'text-ink-muted'
                            }`}
                          >
                            {row.counts[status]}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
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
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink sm:px-5">
              {t.sections.assigned}
            </h3>
            {summary.state.data.assigned.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted sm:px-5">{t.noAssigned}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {summary.state.data.assigned.map((row) => (
                  <li
                    key={`${row.holder.id}-${row.series.id}`}
                    className="flex justify-between gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <span>
                      <span className="font-medium text-ink">{row.holder.displayName}</span>
                      <span className="text-ink-muted"> · {seriesLabel(row.series)}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-ink">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="batches-title" className="space-y-3">
        <SectionHeading id="batches-title" title={t.sections.batches} />
        {/* Loading, failing or empty used to show nothing at all here. */}
        {batches.state.status === 'loading' && <SkeletonList rows={2} />}
        {batches.state.status === 'error' && <Alert>{errorMessage(batches.state.error)}</Alert>}
        {batches.state.status === 'done' && batches.state.data.items.length === 0 && (
          <EmptyState compact title={t.empty} />
        )}
        {batches.state.status === 'done' && batches.state.data.items.length > 0 && (
          <ul className={listClasses}>
            {batches.state.data.items.map((batch) => (
              <li key={batch.id} className="space-y-0.5 px-4 py-3 sm:px-5">
                <p className="font-medium text-ink">
                  {seriesLabel(batch.series)} · {t.received(batch)}
                </p>
                <p className="text-ink-soft">
                  {batch.location} · {t.fields.holderId} : {batch.holder.displayName}
                  {batch.insurerReference && ` · ${batch.insurerReference}`}
                </p>
                <p className="text-xs text-ink-muted">
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
      <SectionHeading id="forms-title" title={t.sections.forms} />
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: number.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-card border border-line bg-surface p-3 shadow-hairline sm:grid-cols-2 sm:p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
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
      {state.status === 'loading' && <SkeletonList rows={3} />}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState compact title={fr.common.empty} />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <ul className={listClasses}>
            {state.data.items.map((form) => (
              <li
                key={form.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
              >
                <span>
                  {/* Opens the form's history. */}
                  <button
                    type="button"
                    onClick={() => onHistory(form.id)}
                    className={`${textLinkClasses} font-mono`}
                  >
                    {seriesLabel(form.series)} n° {form.number}
                  </button>
                  {form.holder && (
                    <span className="text-ink-muted"> · {form.holder.displayName}</span>
                  )}
                  {form.contract && (
                    <>
                      {' · '}
                      <TextLink to={`/contrats/${form.contract.id}`} className="font-mono">
                        {form.contract.ref}
                      </TextLink>
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
