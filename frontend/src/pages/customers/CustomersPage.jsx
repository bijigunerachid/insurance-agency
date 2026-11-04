import { PlusIcon } from '@heroicons/react/20/solid';
import { UsersIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { MoreFilters } from '../../components/MoreFilters.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { PhoneLink } from '../../components/PhoneLink.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatPhone } from '../../utils/format.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.customers;

export function CustomersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', type: '', archived: 'exclude', page: 1 });

  const params = new URLSearchParams({ archived: filters.archived, page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/customers?${params}`);
  const activeFilters = (filters.type ? 1 : 0) + (filters.archived !== 'exclude' ? 1 : 0);

  return (
    <section aria-labelledby="customers-title" className="space-y-5">
      <PageHeader
        title={t.title}
        titleId="customers-title"
        description={t.intro}
        actions={
          can('customers.write') && (
            <ButtonLink to="/clients/nouveau" variant="primary" icon={PlusIcon}>
              {t.create}
            </ButtonLink>
          )
        }
      />
      <WorkspaceNotice text={fr.workspace.noticeCustomers} />

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
            label={t.typeLabel}
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
            options={[
              { value: '', label: t.allTypes },
              { value: 'INDIVIDUAL', label: t.types.INDIVIDUAL },
              { value: 'BUSINESS', label: t.types.BUSINESS },
            ]}
          />
          <SelectField
            label={t.archivedLabel}
            value={filters.archived}
            onChange={(e) => setFilters({ ...filters, archived: e.target.value, page: 1 })}
            options={[
              { value: 'exclude', label: t.archivedExclude },
              { value: 'include', label: t.archivedInclude },
              { value: 'only', label: t.archivedOnly },
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
          icon={UsersIcon}
          title={fr.common.empty}
          description={filters.q || activeFilters > 0 ? fr.common.emptyFiltered : undefined}
        />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <DataTable
            caption={t.title}
            columns={COLUMNS}
            rows={state.data.items}
            renderCard={(customer) => <CustomerCard customer={customer} />}
          />
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

/** Issued contracts: how many, none any more (« — »), or never any. */
function ContractCount({ customer }) {
  if (customer.activeContracts) {
    return <StatusBadge tone="ok">{t.activeCount(customer.activeContracts)}</StatusBadge>;
  }
  if (customer.hasContract) return <span className="text-ink-muted">{fr.common.none}</span>;
  return <StatusBadge tone="neutral">{t.noContract}</StatusBadge>;
}

const COLUMNS = [
  {
    key: 'name',
    header: t.name,
    primary: true,
    cell: (customer) => (
      <>
        <Link to={`/clients/${customer.id}`} className={textLinkClasses}>
          {customer.displayName}
        </Link>
        <div className="font-mono text-xs text-ink-muted">
          {customer.ref}
          {customer.archivedAt ? ` · ${t.archived}` : ''}
        </div>
      </>
    ),
  },
  {
    key: 'contracts',
    header: t.activeContracts,
    cell: (customer) => <ContractCount customer={customer} />,
  },
  {
    key: 'phone',
    header: t.phone,
    className: 'whitespace-nowrap',
    cell: (customer) =>
      customer.phone ? (
        <span className="font-mono">{formatPhone(customer.phone)}</span>
      ) : (
        <span className="text-ink-muted">{fr.common.none}</span>
      ),
  },
  { key: 'city', header: t.city, cell: (customer) => customer.city ?? fr.common.none },
  {
    key: 'assigned',
    header: t.assignedUser,
    cell: (customer) => customer.assignedUser?.displayName ?? t.unassigned,
  },
];

/** On a phone: one card per customer, the name opens it, the phone calls. */
function CustomerCard({ customer }) {
  return (
    <div className="relative rounded-card border border-line bg-surface p-4 shadow-hairline">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/clients/${customer.id}`}
            className="focus-ring rounded-control font-semibold text-ink after:absolute after:inset-0 after:rounded-card hover:text-primary"
          >
            {customer.displayName}
          </Link>
          <p className="text-xs text-ink-muted">
            {[customer.ref, customer.city, customer.archivedAt && t.archived]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {(customer.activeContracts > 0 || !customer.hasContract) && (
          <span className="shrink-0">
            <ContractCount customer={customer} />
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        {customer.phone ? <PhoneLink phone={customer.phone} /> : <span />}
        <span>{customer.assignedUser?.displayName ?? t.unassigned}</span>
      </div>
    </div>
  );
}
