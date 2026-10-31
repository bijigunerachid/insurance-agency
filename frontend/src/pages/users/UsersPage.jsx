import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { CreateUserDialog } from '../../features/users/CreateUserDialog.jsx';
import { TemporaryPasswordDialog } from '../../features/users/TemporaryPasswordDialog.jsx';
import { UserBadges } from '../../features/users/UserBadges.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.users;

export function UsersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', status: 'active', page: 1 });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const { run, dialog } = useSensitiveAction();

  const params = new URLSearchParams({ status: filters.status, page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  const { state, reload } = useApiQuery(`/users?${params}`);
  const roles = useApiQuery('/roles');

  return (
    <section aria-labelledby="users-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="users-title" className="text-2xl font-semibold">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        </div>
        {can('users.manage') && roles.state.status === 'done' && (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden="true" className="size-4" />
            {t.create}
          </Button>
        )}
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <TextField
          className="min-w-48 flex-1"
          label={t.searchLabel}
          type="search"
          maxLength={64}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectField
          label={t.statusLabel}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          options={[
            { value: 'active', label: t.statusActive },
            { value: 'disabled', label: t.statusDisabled },
            { value: 'all', label: t.statusAll },
          ]}
        />
        <Button type="submit" variant="secondary">
          {fr.common.search}
        </Button>
      </form>

      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && (
        <ErrorState
          title={fr.common.genericError}
          body={fr.common.networkError}
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
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t.displayName}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.role}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.state}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.twoFactor}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.lastLogin}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.data.items.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/utilisateurs/${user.id}`}
                        className="font-medium text-blue-700 underline-offset-2 hover:underline"
                      >
                        {user.displayName}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{user.username}</div>
                    </td>
                    <td className="px-4 py-3">{user.role.name}</td>
                    <td className="px-4 py-3">
                      <UserBadges user={user} />
                    </td>
                    <td className="px-4 py-3">
                      {user.twoFactorEnabled ? fr.common.yes : fr.common.no}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t.never}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={state.data.page}
            pageCount={state.data.pageCount}
            total={state.data.total}
            onPage={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}

      {creating && (
        <CreateUserDialog
          roles={roles.state.data.items}
          run={run}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(result);
            reload({ silent: true });
          }}
        />
      )}
      {created && (
        <TemporaryPasswordDialog
          username={created.user.username}
          password={created.temporaryPassword}
          onClose={() => {
            const id = created.user.id;
            setCreated(null);
            navigate(`/utilisateurs/${id}`);
          }}
        />
      )}
      {dialog}
    </section>
  );
}
