import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.audit;
const EMPTY = { action: '', actor: '', from: '', to: '' };

export const actionLabel = (action) => t.actions[action] ?? action;

export function AuditPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState({ ...EMPTY, page: 1 });
  const actions = useApiQuery('/audit/actions');

  const params = new URLSearchParams({ page: String(applied.page) });
  for (const key of ['action', 'actor', 'from', 'to']) {
    if (applied[key]) params.set(key, applied[key]);
  }
  const { state } = useApiQuery(`/audit?${params}`);
  const update = (field) => (event) => setDraft({ ...draft, [field]: event.target.value });

  return (
    <section aria-labelledby="audit-title" className="space-y-4">
      <div>
        <h1 id="audit-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, actor: draft.actor.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <SelectField
          className="lg:col-span-2"
          label={t.action}
          value={draft.action}
          onChange={update('action')}
          options={[
            { value: '', label: t.allActions },
            ...(actions.state.status === 'done' ? actions.state.data.items : []).map((a) => ({
              value: a,
              label: actionLabel(a),
            })),
          ]}
        />
        <TextField
          label={t.actor}
          hint={t.actorHint}
          maxLength={64}
          value={draft.actor}
          onChange={update('actor')}
        />
        <TextField label={t.from} type="date" value={draft.from} onChange={update('from')} />
        <TextField label={t.to} type="date" value={draft.to} onChange={update('to')} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">{fr.common.filter}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(EMPTY);
              setApplied({ ...EMPTY, page: 1 });
            }}
          >
            {fr.common.reset}
          </Button>
        </div>
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
          <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {state.data.items.map((event) => (
              <li key={event.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[11rem_1fr]">
                <time dateTime={event.at} className="whitespace-nowrap text-slate-600">
                  {formatDateTime(event.at)}
                </time>
                <div className="min-w-0 space-y-1">
                  <p>
                    <span className="font-medium">{actionLabel(event.action)}</span>
                    <span className="text-slate-500">
                      {' · '}
                      {event.actor
                        ? `${event.actor.displayName} (${event.actor.username})`
                        : t.system}
                    </span>
                  </p>
                  <Details event={event} />
                </div>
              </li>
            ))}
          </ol>
          <Pagination
            page={state.data.page}
            pageCount={state.data.pageCount}
            total={state.data.total}
            onPage={(page) => setApplied({ ...applied, page })}
          />
        </>
      )}
    </section>
  );
}

/** Technical context as plain text (rendered by React, so never interpreted as HTML). */
function Details({ event }) {
  const entries = Object.entries(event.details ?? {});
  if (!entries.length && !event.entityType) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 break-all font-mono text-xs text-slate-600">
      {event.entityType && (
        <div>
          <dt className="inline">{t.entity} : </dt>
          <dd className="inline">
            {event.entityType} {event.entityId}
          </dd>
        </div>
      )}
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="inline">{key} : </dt>
          <dd className="inline">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
