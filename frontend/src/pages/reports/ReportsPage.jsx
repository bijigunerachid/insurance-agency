import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { QuickPeriods } from '../../components/QuickPeriods.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CANCELLED, useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiDownload } from '../../services/api.js';
import { formatDate, formatMoney } from '../../utils/format.js';
import { monthOf } from '../../utils/periods.js';

const t = fr.reports;
/** The reports that show today's situation: the period is not used. */
const NOW = { 'reversements-dus': t.ownedNow, 'soldes-clients': t.owedNow };

/** A report's lines have no id of their own: their place in the list keys them. */
const LINE = Symbol('line');

const currentMonth = () => monthOf(0);

function cell(column, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'money') return formatMoney(value);
  if (column.type === 'date') return formatDate(value);
  return value;
}
const numeric = (column) => column.type === 'money' || column.type === 'int';

/** The server's columns as the table's: figures on the right, never cut over two lines. */
const toColumns = (columns) =>
  columns.map((column, index) => ({
    key: column.key,
    header: column.label,
    primary: index === 0,
    align: numeric(column) ? 'right' : 'left',
    className: numeric(column) ? 'whitespace-nowrap tabular-nums' : 'whitespace-nowrap',
    cell: (row) => cell(column, row[column.key]),
  }));

/** The money totals of a report (its number of lines is said above the table). */
function totalsOf(report) {
  const cells = {};
  for (const column of report.columns) {
    const value = report.totals?.[column.key];
    if (column.type === 'money' && value !== undefined) cells[column.key] = formatMoney(value);
  }
  return Object.keys(cells).length > 0 ? { label: t.total, cells } : undefined;
}

/** The agency's six reports on screen, and their CSV / Excel exports for management. */
export function ReportsPage() {
  const { can } = useAuth();
  const list = useApiQuery('/reports');
  const [choice, setChoice] = useState({ name: 'contrats-echeances', ...currentMonth() });
  const valid = choice.from && choice.to;
  const period = `from=${choice.from}&to=${choice.to}`;
  const { state } = useApiQuery(valid ? `/reports/${choice.name}?${period}` : null);
  const sensitive = useSensitiveAction();
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [exportError, setExportError] = useState(null);
  const change = (next) => {
    setChoice({ ...choice, ...next });
    setNotice(null);
    setExportError(null);
  };
  const periodError =
    state.status === 'error' && state.error.code === 'VALIDATION_ERROR'
      ? t.rules[state.error.details?.[0]?.rule]
      : null;
  const now = NOW[choice.name];

  async function download(format) {
    setBusy(format);
    setNotice(null);
    setExportError(null);
    try {
      const name = await sensitive.run(() =>
        apiDownload(`/reports/${choice.name}/export?${period}&format=${format}`),
      );
      setNotice(t.exported(name));
    } catch (err) {
      if (err.code !== CANCELLED) setExportError(err);
    } finally {
      setBusy(null);
    }
  }

  const exportButton = (format, label) => (
    <Button
      variant="secondary"
      size="sm"
      icon={ArrowDownTrayIcon}
      loading={busy === format}
      disabled={busy !== null}
      onClick={() => download(format)}
    >
      {label}
    </Button>
  );

  return (
    <section aria-labelledby="reports-title" className="space-y-6">
      <PageHeader titleId="reports-title" title={t.title} description={t.intro} />
      {list.state.status === 'error' && <Alert>{errorMessage(list.state.error)}</Alert>}

      <div className="space-y-4 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <SelectField
            className="col-span-2 lg:col-span-1"
            label={t.report}
            value={choice.name}
            onChange={(event) => change({ name: event.target.value })}
            options={
              list.state.status === 'done'
                ? list.state.data.items.map((r) => ({ value: r.name, label: r.title }))
                : [{ value: choice.name, label: fr.app.loading }]
            }
          />
          <TextField
            label={t.from}
            type="date"
            value={choice.from}
            onChange={(event) => change({ from: event.target.value })}
          />
          <TextField
            label={t.to}
            type="date"
            value={choice.to}
            onChange={(event) => change({ to: event.target.value })}
            error={periodError}
          />
        </div>
        <QuickPeriods from={choice.from} to={choice.to} onChange={change} />
        {now && <Alert tone="info">{now}</Alert>}
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
      {state.status === 'done' && (
        <section aria-labelledby="report-heading" className="space-y-3">
          <SectionHeading
            id="report-heading"
            title={state.data.title}
            description={`${t.rows(state.data.rows.length)} · ${
              now ? t.today : t.between(formatDate(choice.from), formatDate(choice.to))
            }`}
            actions={
              can('reports.export') && (
                <>
                  {exportButton('csv', t.exportCsv)}
                  {exportButton('xlsx', t.exportXlsx)}
                </>
              )
            }
          />
          {state.data.rows.length === 0 ? (
            <EmptyState icon={ChartBarIcon} title={t.none} description={t.noneHint} />
          ) : (
            <DataTable
              caption={state.data.title}
              columns={toColumns(state.data.columns)}
              rows={state.data.rows.map((row, index) => ({ ...row, [LINE]: index }))}
              rowKey={(row) => row[LINE]}
              footer={totalsOf(state.data)}
              stickyFirst
            />
          )}
        </section>
      )}
      {sensitive.dialog}
    </section>
  );
}
