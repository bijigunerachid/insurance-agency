import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CANCELLED, useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiDownload } from '../../services/api.js';
import { APP_TIME_ZONE, formatDate, formatMoney } from '../../utils/format.js';

const t = fr.reports;
/** Kept in view, with its own background and a line at its right, as the rest scrolls. */
const FIRST_COLUMN = 'sticky left-0 z-10 bg-inherit shadow-[1px_0_0_var(--color-slate-200)]';

const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());
const iso = (date) => date.toISOString().slice(0, 10);

/** First and last day of a month (0 = this one, -1 = the one before), agency time zone. */
function monthOf(offset = 0) {
  const [year, month] = todayHere().split('-').map(Number);
  return {
    from: iso(new Date(Date.UTC(year, month - 1 + offset, 1))),
    to: iso(new Date(Date.UTC(year, month + offset, 0))),
  };
}
const currentMonth = () => monthOf(0);
/** The periods asked for most, one tap each. */
const QUICK_PERIODS = {
  thisMonth: () => monthOf(0),
  lastMonth: () => monthOf(-1),
  thisYear: () => {
    const year = todayHere().slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  },
};

function cell(column, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'money') return formatMoney(value);
  if (column.type === 'date') return formatDate(value);
  return value;
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [exportError, setExportError] = useState(null);
  const set = (key) => (event) => {
    setChoice({ ...choice, [key]: event.target.value });
    setNotice(null);
  };
  const periodError =
    state.status === 'error' && state.error.code === 'VALIDATION_ERROR'
      ? t.rules[state.error.details?.[0]?.rule]
      : null;

  async function download(format) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reports-title" className="space-y-4">
      <div>
        <h1 id="reports-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>
      {list.state.status === 'error' && <Alert>{errorMessage(list.state.error)}</Alert>}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3 sm:p-4">
        <SelectField
          className="col-span-2 sm:col-span-1"
          label={t.report}
          value={choice.name}
          onChange={set('name')}
          options={
            list.state.status === 'done'
              ? list.state.data.items.map((r) => ({ value: r.name, label: r.title }))
              : [{ value: choice.name, label: fr.app.loading }]
          }
        />
        <TextField label={t.from} type="date" value={choice.from} onChange={set('from')} />
        <TextField
          label={t.to}
          type="date"
          value={choice.to}
          onChange={set('to')}
          error={periodError}
        />
        <div
          className="col-span-2 flex flex-wrap gap-2 sm:col-span-3"
          role="group"
          aria-label={t.quickPeriod}
        >
          {Object.entries(QUICK_PERIODS).map(([key, range]) => {
            const { from, to } = range();
            const current = choice.from === from && choice.to === to;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={current}
                onClick={() => {
                  setChoice({ ...choice, from, to });
                  setNotice(null);
                }}
                className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-blue-700 ${
                  current
                    ? 'bg-blue-700 text-white ring-blue-700'
                    : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {t.periods[key]}
              </button>
            );
          })}
        </div>
      </div>
      {choice.name === 'reversements-dus' && <Alert tone="info">{t.ownedNow}</Alert>}
      {choice.name === 'soldes-clients' && <Alert tone="info">{t.owedNow}</Alert>}
      {exportError && <Alert>{errorMessage(exportError)}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {state.status === 'loading' && valid && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && !periodError && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && (
        <section aria-labelledby="report-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="report-heading" className="text-lg font-semibold">
              {state.data.title}{' '}
              <span className="text-sm font-normal text-slate-600">
                · {t.rows(state.data.rows.length)}
              </span>
            </h2>
            {can('reports.export') && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => download('csv')}>
                  <ArrowDownTrayIcon aria-hidden="true" className="size-4" />
                  {t.exportCsv}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => download('xlsx')}>
                  <ArrowDownTrayIcon aria-hidden="true" className="size-4" />
                  {t.exportXlsx}
                </Button>
              </div>
            )}
          </div>
          {state.data.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {t.none}
            </p>
          ) : (
            // Wide reports scroll inside their box, never the whole page.
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr className="bg-slate-50">
                    {state.data.columns.map((column, i) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={`whitespace-nowrap px-3 py-2 font-medium ${column.type === 'money' || column.type === 'int' ? 'text-right' : ''} ${i === 0 ? FIRST_COLUMN : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.data.rows.map((row, index) => (
                    <tr key={index} className="bg-white">
                      {state.data.columns.map((column, i) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap px-3 py-2 ${column.type === 'money' || column.type === 'int' ? 'text-right tabular-nums' : ''} ${i === 0 ? FIRST_COLUMN : ''}`}
                        >
                          {cell(column, row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(state.data.totals ?? {}).some((key) => key !== 'count') && (
                  <tfoot className="border-t border-slate-300 font-semibold">
                    <tr className="bg-white">
                      {state.data.columns.map((column, i) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap px-3 py-2 ${column.type === 'money' ? 'text-right tabular-nums' : ''} ${i === 0 ? FIRST_COLUMN : ''}`}
                        >
                          {i === 0
                            ? t.total
                            : column.type === 'money' && state.data.totals[column.key] !== undefined
                              ? formatMoney(state.data.totals[column.key])
                              : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}
      {sensitive.dialog}
    </section>
  );
}
