import { ArrowDownTrayIcon, PrinterIcon } from '@heroicons/react/20/solid';
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { QuickPeriods } from '../../components/QuickPeriods.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CANCELLED, useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { useWorkspace } from '../../features/workspace/Workspace.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiDownload } from '../../services/api.js';
import { formatDate, formatMoney } from '../../utils/format.js';
import { monthOf, todayHere } from '../../utils/periods.js';

const t = fr.production;
const paymentStates = fr.contracts.paymentStates;

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);
const money = (value) => (value === null || value === undefined ? '—' : formatMoney(value));
const date = (value) => (value ? formatDate(value) : '—');

/** The sheet's columns, on screen and on paper (owner, 05/11/2026). */
const COLUMNS = [
  { key: 'order', header: 'Ordre', align: 'right', cell: (row) => row.order },
  {
    key: 'policyNumber',
    header: 'N° de police',
    primary: true,
    className: 'whitespace-nowrap font-mono',
    cell: (row) => row.policyNumber,
  },
  { key: 'customer', header: 'Client', cell: (row) => row.customer },
  { key: 'premium', header: 'Prime', align: 'right', cell: (row) => money(row.premium) },
  { key: 'startDate', header: 'Effet', cell: (row) => date(row.startDate) },
  { key: 'endDate', header: 'Échéance', cell: (row) => date(row.endDate) },
  { key: 'balance', header: 'Reste', align: 'right', cell: (row) => money(row.balance) },
  { key: 'collectedOn', header: 'Date encaissée', cell: (row) => date(row.collectedOn) },
  { key: 'cancelledOn', header: 'Annulé le', cell: (row) => date(row.cancelledOn) },
  { key: 'operator', header: 'Opérateur', cell: (row) => dash(row.operator) },
].map((column) => ({
  ...column,
  className: `${column.className ?? 'whitespace-nowrap'}${column.align === 'right' ? ' tabular-nums' : ''}`,
}));

/**
 * The état de production: the contracts the insurer issued in a period, as the agency's printed
 * sheet lists them; printed A4 landscape, exported to Excel by management. An agent sees their
 * own production (the API decides), management chooses an employee or everyone.
 */
export function ProductionPage() {
  const { can } = useAuth();
  const workspace = useWorkspace();
  const everyone = can('production.all');
  const [choice, setChoice] = useState({
    ...monthOf(0),
    basis: 'ISSUE',
    // The insurer of the workspace chosen after sign-in, else both.
    insurerId: workspace.insurer?.id ?? '',
    operatorId: '',
    payment: '',
  });
  const change = (next) => {
    setChoice({ ...choice, ...next });
    setNotice(null);
    setExportError(null);
  };
  const params = new URLSearchParams({ basis: choice.basis, from: choice.from, to: choice.to });
  for (const key of ['insurerId', 'operatorId', 'payment']) {
    if (choice[key]) params.set(key, choice[key]);
  }
  const valid = choice.from && choice.to;
  const { state } = useApiQuery(valid ? `/production?${params}` : null);
  const operators = useApiQuery(everyone ? '/production/operators' : null);
  const sensitive = useSensitiveAction();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [exportError, setExportError] = useState(null);
  const periodError =
    state.status === 'error' && state.error.code === 'VALIDATION_ERROR'
      ? fr.reports.rules[state.error.details?.[0]?.rule]
      : null;

  async function download() {
    setBusy(true);
    setNotice(null);
    setExportError(null);
    try {
      const name = await sensitive.run(() =>
        apiDownload(`/production/export?${params}&format=xlsx`),
      );
      setNotice(t.exported(name));
    } catch (err) {
      if (err.code !== CANCELLED) setExportError(err);
    } finally {
      setBusy(false);
    }
  }

  const report = state.status === 'done' ? state.data : null;
  return (
    <section aria-labelledby="production-title" className="space-y-6">
      <div className="space-y-6 print:hidden">
        <PageHeader titleId="production-title" title={t.title} description={t.intro} />

        <div className="space-y-4 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <TextField
              label={fr.reports.from}
              type="date"
              value={choice.from}
              onChange={(event) => change({ from: event.target.value })}
            />
            <TextField
              label={fr.reports.to}
              type="date"
              value={choice.to}
              onChange={(event) => change({ to: event.target.value })}
              error={periodError}
            />
            {workspace.items.length > 1 && (
              <SelectField
                className="col-span-2 sm:col-span-1"
                label={t.insurer}
                value={choice.insurerId}
                onChange={(event) => change({ insurerId: event.target.value })}
                options={[
                  { value: '', label: t.allInsurers },
                  ...workspace.items.map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
            )}
            {everyone && (
              <SelectField
                className="col-span-2 sm:col-span-1"
                label={t.operator}
                value={choice.operatorId}
                onChange={(event) => change({ operatorId: event.target.value })}
                options={[
                  { value: '', label: t.allOperators },
                  ...(operators.state.status === 'done'
                    ? operators.state.data.items.map((o) => ({ value: o.id, label: o.displayName }))
                    : []),
                ]}
              />
            )}
          </div>
          <QuickPeriods from={choice.from} to={choice.to} onChange={change} />
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <SegmentedControl
              label={t.basis}
              value={choice.basis}
              onChange={(basis) => change({ basis })}
              options={Object.entries(t.bases).map(([value, label]) => ({ value, label }))}
            />
            <SegmentedControl
              label={t.payment}
              value={choice.payment}
              onChange={(payment) => change({ payment })}
              gridOnPhone
              options={[
                { value: '', label: fr.contracts.paymentAll },
                ...Object.entries(paymentStates).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        </div>

        {exportError && <Alert>{errorMessage(exportError)}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {state.status === 'loading' && valid && <SkeletonList rows={6} />}
        {state.status === 'error' && !periodError && (
          <ErrorState
            title={errorMessage(state.error)}
            body={fr.common.genericError}
            requestId={state.error.requestId}
          />
        )}
        {report && (
          <section aria-labelledby="production-list" className="space-y-3">
            <SectionHeading
              id="production-list"
              title={t.sheetTitle(report.insurer?.name ?? t.allInsurers)}
              description={`${t.contracts(report.totals.count)} · ${fr.reports.between(
                formatDate(report.from),
                formatDate(report.to),
              )} · ${t.bases[report.basis].toLowerCase()}`}
              actions={
                report.rows.length > 0 && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={PrinterIcon}
                      onClick={() => window.print()}
                    >
                      {t.print}
                    </Button>
                    {can('reports.export') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={ArrowDownTrayIcon}
                        loading={busy}
                        disabled={busy}
                        onClick={download}
                      >
                        {t.exportXlsx}
                      </Button>
                    )}
                  </>
                )
              }
            />
            {report.rows.length === 0 ? (
              <EmptyState
                icon={ClipboardDocumentCheckIcon}
                title={t.none}
                description={t.noneHint}
              />
            ) : (
              <>
                <DataTable
                  caption={t.title}
                  columns={COLUMNS}
                  rows={report.rows}
                  rowKey={(row) => row.id}
                  footer={{
                    label: t.totals,
                    cells: {
                      premium: formatMoney(report.totals.premium),
                      balance: formatMoney(report.totals.balance),
                    },
                  }}
                  stickyFirst
                />
                <p className="text-sm text-ink-soft">
                  {t.collected} :{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {formatMoney(report.totals.collected)}
                  </span>
                </p>
                {report.rows.some((row) => row.cancelledOn) && (
                  <p className="text-xs text-ink-muted">{t.cancelledNote}</p>
                )}
              </>
            )}
          </section>
        )}
      </div>
      {report && report.rows.length > 0 && <Sheet report={report} />}
      {sensitive.dialog}
    </section>
  );
}

/** The printed sheet: hidden on screen, A4 landscape on paper. */
function Sheet({ report }) {
  const { agency, totals } = report;
  const cell = 'border border-black/60 px-1.5 py-1';
  return (
    <article
      aria-hidden="true"
      className="print-landscape hidden text-[9pt] text-black print:block"
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          {agency.name && <p className="text-[12pt] font-bold uppercase">{agency.name}</p>}
          {agency.acapsNumber && (
            <p>
              {fr.receipt.acaps} {agency.acapsNumber}
            </p>
          )}
        </div>
        <div className="text-center">
          <h2 className="text-[14pt] font-bold uppercase">
            {t.sheetTitle(report.insurer?.name ?? t.allInsurers)}
          </h2>
          <p>{t.sheetPeriod(formatDate(report.from), formatDate(report.to))}</p>
          <p>{t.sheetBasis(t.bases[report.basis])}</p>
          {report.operator && <p>{t.sheetOperator(report.operator.displayName)}</p>}
          {report.payment && <p>{t.sheetPayment(paymentStates[report.payment])}</p>}
        </div>
        <p>{t.printedOn(formatDate(todayHere()))}</p>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${cell} bg-black/5 text-left font-semibold uppercase`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.id} className="break-inside-avoid">
              {COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={`${cell} ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={3} className={`${cell} text-right uppercase`}>
              {t.totals}
            </td>
            <td className={`${cell} text-right tabular-nums`}>{formatMoney(totals.premium)}</td>
            <td colSpan={2} className={cell} />
            <td className={`${cell} text-right tabular-nums`}>{formatMoney(totals.balance)}</td>
            <td colSpan={3} className={cell} />
          </tr>
          <tr className="font-semibold">
            <td colSpan={3} className={`${cell} text-right uppercase`}>
              {t.collected}
            </td>
            <td className={`${cell} text-right tabular-nums`}>{formatMoney(totals.collected)}</td>
            <td colSpan={6} className={cell} />
          </tr>
        </tfoot>
      </table>
      {report.rows.some((row) => row.cancelledOn) && (
        <p className="mt-2 text-[8pt]">{t.cancelledNote}</p>
      )}
    </article>
  );
}
