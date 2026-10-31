import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { RenewalList } from '../../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';

const t = fr.renewals;
/** The renewal window (30 days); shown in the introduction. */
const WINDOW_DAYS = 30;

export function RenewalsPage() {
  const [filters, setFilters] = useState({ status: 'open', mine: false, page: 1 });
  const params = new URLSearchParams({ status: filters.status, page: String(filters.page) });
  if (filters.mine) params.set('mine', 'true');
  const { state } = useApiQuery(`/renewals?${params}`);

  return (
    <section aria-labelledby="renewals-title" className="space-y-4">
      <div>
        <h1 id="renewals-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro(WINDOW_DAYS)}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <SelectField
          label={t.statusLabel}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          options={Object.entries(t.filters).map(([value, label]) => ({ value, label }))}
        />
        <label className="flex items-center gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={filters.mine}
            onChange={(e) => setFilters({ ...filters, mine: e.target.checked, page: 1 })}
            className="size-4 rounded border-slate-300"
          />
          {t.mineLabel}
        </label>
      </div>
      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          {t.none}
        </p>
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
