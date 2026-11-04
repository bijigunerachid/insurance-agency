import { TruckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { MoreFilters } from '../../components/MoreFilters.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { VehicleTable } from '../../features/vehicles/VehicleTable.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

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
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/vehicles?${params}`);
  const activeFilters = (filters.category ? 1 : 0) + (filters.archived !== 'exclude' ? 1 : 0);

  return (
    <section aria-labelledby="vehicles-title" className="space-y-5">
      <PageHeader title={t.title} titleId="vehicles-title" description={t.intro} />
      {fleetId && (
        <Alert tone="info">
          {t.fleetFiltered} <TextLink to="/vehicules">{t.showAll}</TextLink>
        </Alert>
      )}
      <WorkspaceNotice text={fr.workspace.noticeVehicles} />

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4 md:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
      >
        {/* On a phone the button sits beside the box; on a computer it ends the row. */}
        <div className="flex items-end gap-2 md:contents">
          <TextField
            className="min-w-0 flex-1 md:col-span-2 lg:col-span-1"
            label={t.searchLabel}
            type="search"
            maxLength={80}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="md:order-last md:justify-self-start">
            {fr.common.search}
          </Button>
        </div>
        <MoreFilters active={activeFilters}>
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
        </MoreFilters>
      </form>

      {state.status === 'loading' && <SkeletonList />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState
          icon={TruckIcon}
          title={fr.common.empty}
          description={filters.q || activeFilters > 0 ? fr.common.emptyFiltered : undefined}
        />
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
