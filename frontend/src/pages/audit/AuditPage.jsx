import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.audit;
const EMPTY = { action: '', actor: '', from: '', to: '' };

export const actionLabel = (action) => t.actions[action] ?? action;

/** What was done, by whom and when: read-only, newest first, filtered by the server. */
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
    <section aria-labelledby="audit-title" className="space-y-6">
      <PageHeader titleId="audit-title" title={t.title} description={t.intro} />

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, actor: draft.actor.trim(), page: 1 });
        }}
        className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-hairline sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start"
      >
        <SelectField
          className="sm:col-span-2 lg:col-span-1"
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
          className="sm:col-span-2 lg:col-span-1"
          label={t.actor}
          hint={t.actorHint}
          maxLength={64}
          value={draft.actor}
          onChange={update('actor')}
        />
        <TextField label={t.from} type="date" value={draft.from} onChange={update('from')} />
        <TextField label={t.to} type="date" value={draft.to} onChange={update('to')} />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">{fr.common.filter}</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setApplied({ ...EMPTY, page: 1 });
            }}
          >
            {fr.common.reset}
          </Button>
        </div>
      </form>

      {state.status === 'loading' && <SkeletonList rows={6} />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState icon={ClipboardDocumentListIcon} title={fr.common.empty} />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <div className="space-y-3">
          <ol
            aria-label={t.title}
            className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-hairline"
          >
            {state.data.items.map((event) => (
              <li
                key={event.id}
                className="grid gap-1.5 px-4 py-3.5 text-sm md:grid-cols-[10.5rem_minmax(0,1fr)] md:gap-4 sm:px-5"
              >
                <time
                  dateTime={event.at}
                  className="whitespace-nowrap text-ink-muted tabular-nums md:pt-px"
                >
                  {formatDateTime(event.at)}
                </time>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-ink">
                    <span className="font-semibold">{actionLabel(event.action)}</span>
                    <span className="text-ink-muted">
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
        </div>
      )}
    </section>
  );
}

/** Technical context as plain text (rendered by React, so never interpreted as HTML). */
function Details({ event }) {
  const entries = Object.entries(event.details ?? {});
  if (!entries.length && !event.entityType) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 break-all rounded-control bg-sunken px-2.5 py-1.5 font-mono text-xs text-ink-soft">
      {event.entityType && (
        <div>
          <dt className="inline text-ink-muted">{t.entity} : </dt>
          <dd className="inline">
            {event.entityType} {event.entityId}
          </dd>
        </div>
      )}
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="inline text-ink-muted">{key} : </dt>
          <dd className="inline">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
