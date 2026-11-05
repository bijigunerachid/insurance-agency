import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/20/solid';
import { UsersIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { CreateUserDialog } from '../../features/users/CreateUserDialog.jsx';
import { TemporaryPasswordDialog } from '../../features/users/TemporaryPasswordDialog.jsx';
import { UserBadges } from '../../features/users/UserBadges.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.users;
const STATUSES = [
  { value: 'active', label: t.statusActive },
  { value: 'disabled', label: t.statusDisabled },
  { value: 'all', label: t.statusAll },
];

const COLUMNS = [
  {
    key: 'name',
    header: t.displayName,
    primary: true,
    cell: (user) => (
      <>
        <TextLink to={`/utilisateurs/${user.id}`}>{user.displayName}</TextLink>
        <span className="block font-mono text-xs font-normal text-ink-muted">{user.username}</span>
      </>
    ),
  },
  { key: 'role', header: t.role, cell: (user) => user.role.name },
  {
    key: 'state',
    header: t.state,
    cell: (user) => (
      <span className="inline-flex justify-end md:justify-start">
        <UserBadges user={user} />
      </span>
    ),
  },
  {
    key: 'twoFactor',
    header: t.twoFactor,
    cell: (user) => (user.twoFactorEnabled ? fr.common.yes : fr.common.no),
  },
  {
    key: 'lastLogin',
    header: t.lastLogin,
    className: 'whitespace-nowrap',
    cell: (user) => (user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t.never),
  },
];

/** The agency's employee accounts: find one, open it, or create one (administrators). */
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
    <section aria-labelledby="users-title" className="space-y-6">
      <PageHeader
        titleId="users-title"
        title={t.title}
        description={t.intro}
        actions={
          can('users.manage') &&
          roles.state.status === 'done' && (
            <Button icon={PlusIcon} onClick={() => setCreating(true)}>
              {t.create}
            </Button>
          )
        }
      />

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="flex flex-wrap items-end gap-4 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5"
      >
        <div className="flex min-w-60 flex-1 items-end gap-2">
          <TextField
            className="flex-1"
            label={t.searchLabel}
            type="search"
            maxLength={64}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary" icon={MagnifyingGlassIcon}>
            {fr.common.search}
          </Button>
        </div>
        <SegmentedControl
          label={t.statusLabel}
          value={filters.status}
          onChange={(status) => setFilters({ ...filters, status, page: 1 })}
          options={STATUSES}
        />
      </form>

      {state.status === 'loading' && <SkeletonList rows={4} />}
      {state.status === 'error' && (
        <ErrorState
          title={fr.common.genericError}
          body={fr.common.networkError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState icon={UsersIcon} title={fr.common.empty} />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <div className="space-y-3">
          <DataTable caption={t.title} columns={COLUMNS} rows={state.data.items} />
          <Pagination
            page={state.data.page}
            pageCount={state.data.pageCount}
            total={state.data.total}
            onPage={(page) => setFilters({ ...filters, page })}
          />
        </div>
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
