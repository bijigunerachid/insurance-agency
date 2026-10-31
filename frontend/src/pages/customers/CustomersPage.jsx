import { PhoneIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { MoreFilters } from '../../components/MoreFilters.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useWideScreen } from '../../hooks/useWideScreen.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatPhone } from '../../utils/format.js';

const t = fr.customers;

export function CustomersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', type: '', archived: 'exclude', page: 1 });

  const params = new URLSearchParams({ archived: filters.archived, page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  const { state } = useApiQuery(`/customers?${params}`);
  const wide = useWideScreen();
  const activeFilters = (filters.type ? 1 : 0) + (filters.archived !== 'exclude' ? 1 : 0);

  return (
    <section aria-labelledby="customers-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="customers-title" className="text-2xl font-semibold">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        </div>
        {can('customers.write') && (
          <Link
            to="/clients/nouveau"
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            {t.create}
          </Link>
        )}
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 md:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
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
          {!wide && <CustomerCards customers={state.data.items} />}
          {wide && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t.name}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t.activeContracts}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t.phone}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t.city}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t.assignedUser}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.data.items.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${customer.id}`}
                          className="font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {customer.displayName}
                        </Link>
                        <div className="font-mono text-xs text-slate-500">
                          {customer.ref}
                          {customer.archivedAt ? ` · ${t.archived}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.activeContracts
                          ? t.activeCount(customer.activeContracts)
                          : fr.common.none}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono">
                        {formatPhone(customer.phone) ?? fr.common.none}
                      </td>
                      <td className="px-4 py-3">{customer.city ?? fr.common.none}</td>
                      <td className="px-4 py-3">
                        {customer.assignedUser?.displayName ?? t.unassigned}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

/** On a phone: one card per customer, the name opens it, the phone calls. */
function CustomerCards({ customers }) {
  return (
    <ul className="space-y-2">
      {customers.map((customer) => (
        <li
          key={customer.id}
          className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/clients/${customer.id}`}
                className="font-semibold text-blue-700 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                {customer.displayName}
              </Link>
              <p className="text-xs text-slate-500">
                {[customer.ref, customer.city, customer.archivedAt && t.archived]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {customer.activeContracts > 0 && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                {t.activeCount(customer.activeContracts)}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="relative inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 ring-1 ring-inset ring-blue-200 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <PhoneIcon aria-hidden="true" className="size-4" />
                {formatPhone(customer.phone)}
              </a>
            ) : (
              <span />
            )}
            <span>{customer.assignedUser?.displayName ?? t.unassigned}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
