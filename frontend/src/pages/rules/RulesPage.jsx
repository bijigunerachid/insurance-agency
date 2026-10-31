import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { EntryFormDialog } from '../../features/catalogue/EntryFormDialog.jsx';
import { RuleStatusBadge } from '../../features/rules/RuleStatusBadge.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';

const t = fr.rules;
const NEW_RULE_STATUSES = ['UNKNOWN', 'DOCUMENT', 'LAW', 'PUBLIC', 'PRESS'];

/** The rules register (docs/insurer-rules.md) with filters by insurer, status and text. */
export function RulesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ insurer: '', status: '', q: '' });
  const [creating, setCreating] = useState(false);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const { state } = useApiQuery(params.size ? `/rules?${params}` : '/rules');
  const insurers = useApiQuery('/insurers');
  const insurerItems = insurers.state.status === 'done' ? insurers.state.data.items : [];

  return (
    <section aria-labelledby="rules-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="rules-title" className="text-2xl font-semibold">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        </div>
        {can('catalogue.manage') && (
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
          setFilters({ ...filters, q: search.trim() });
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end"
      >
        <TextField
          className="sm:col-span-2 lg:col-span-1"
          label={t.searchLabel}
          type="search"
          maxLength={80}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={t.scope}
          value={filters.insurer}
          onChange={(event) => setFilters({ ...filters, insurer: event.target.value })}
          options={[
            { value: '', label: t.allScopes },
            { value: 'GENERAL', label: t.general },
            ...insurerItems.map((i) => ({ value: i.code, label: i.code })),
          ]}
        />
        <SelectField
          label={t.status}
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          options={[
            { value: '', label: t.allStatuses },
            ...Object.entries(t.statuses).map(([value, label]) => ({ value, label })),
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
          <p className="text-sm text-slate-600">{t.count(state.data.items.length)}</p>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {state.data.items.map((rule) => (
              <li key={rule.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/regles/${rule.id}`}
                    className="font-mono font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    {rule.code}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {rule.insurer ? rule.insurer.code : t.general}
                  </span>
                  <RuleStatusBadge status={rule.status} />
                </div>
                <p className="text-sm">{rule.statement}</p>
                <p className="text-xs text-slate-600">
                  {t.source} : {rule.source}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <EntryFormDialog
          title={t.create}
          fields={[
            { name: 'code', label: t.code, hint: t.codeHint, required: true, maxLength: 8 },
            {
              name: 'insurerId',
              label: t.scope,
              type: 'select',
              options: [
                { value: '', label: t.general },
                ...insurerItems.map((i) => ({ value: i.id, label: i.name })),
              ],
            },
            {
              name: 'statement',
              label: t.statement,
              type: 'textarea',
              required: true,
              maxLength: 1000,
            },
            { name: 'effect', label: t.effect, type: 'textarea', required: true, maxLength: 1000 },
            { name: 'source', label: t.source, required: true, maxLength: 400 },
            {
              name: 'status',
              label: t.status,
              type: 'select',
              options: NEW_RULE_STATUSES.map((value) => ({ value, label: t.statuses[value] })),
            },
          ]}
          initial={{
            code: '',
            insurerId: '',
            statement: '',
            effect: '',
            source: '',
            status: 'UNKNOWN',
          }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const rule = await apiPost('/rules', values);
            navigate(`/regles/${rule.id}`);
          }}
        />
      )}
    </section>
  );
}
