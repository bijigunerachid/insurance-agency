import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { VehicleTable } from '../../features/vehicles/VehicleTable.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';

const t = fr.vehicles;

export function VehiclesPage() {
  const [searchParams] = useSearchParams();
  // Opened from a customer's fleet: /vehicules?flotte=<id>.
  const fleetId = searchParams.get('flotte');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', category: '', archived: 'exclude', page: 1 });
  const params = new URLSearchParams({ archived: filters.archived, page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (fleetId) params.set('fleetId', fleetId);
  const { state } = useApiQuery(`/vehicles?${params}`);

  return (
    <section aria-labelledby="vehicles-title" className="space-y-4">
      <div>
        <h1 id="vehicles-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        {fleetId && (
          <p className="mt-2 text-sm">
            {t.fleetFiltered}{' '}
            <Link to="/vehicules" className="font-medium text-blue-700 underline">
              {t.showAll}
            </Link>
          </p>
        )}
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
      >
        <TextField
          className="sm:col-span-2 lg:col-span-1"
          label={t.searchLabel}
          type="search"
          maxLength={80}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectField
          label={t.categoryLabel}
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
          options={[
            { value: '', label: t.allCategories },
            ...Object.entries(t.categories).map(([value, label]) => ({ value, label })),
          ]}
        />
        <SelectField
          label={fr.customers.archivedLabel}
          value={filters.archived}
          onChange={(e) => setFilters({ ...filters, archived: e.target.value, page: 1 })}
          options={[
            { value: 'exclude', label: fr.customers.archivedExclude },
            { value: 'include', label: fr.customers.archivedInclude },
            { value: 'only', label: fr.customers.archivedOnly },
          ]}
        />
        <Button type="submit" variant="secondary">
          {fr.common.search}
        </Button>
      </form>

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
          {fr.common.empty}
        </p>
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <VehicleTable vehicles={state.data.items} />
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
