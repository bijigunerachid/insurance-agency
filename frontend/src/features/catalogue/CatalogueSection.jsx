import { PlusIcon } from '@heroicons/react/20/solid';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';

/** A titled block of the catalogue page, with its list of entries. */
export function CatalogueSection({ id, title, intro, addLabel, onAdd, filters, children }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          {intro && <p className="mt-0.5 text-sm text-slate-600">{intro}</p>}
        </div>
        {onAdd && (
          <Button variant="secondary" onClick={onAdd}>
            <PlusIcon aria-hidden="true" className="size-4" />
            {addLabel}
          </Button>
        )}
      </div>
      {filters && <div className="border-b border-slate-200 px-4 py-3">{filters}</div>}
      {children}
    </section>
  );
}

/** Loading, error and empty states of a section's list; `render(data)` draws the rest. */
export function QueryState({ state, empty, isEmpty, render }) {
  if (state.status === 'loading') {
    return (
      <div className="p-4">
        <Spinner label={fr.app.loading} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="p-4">
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      </div>
    );
  }
  if (isEmpty(state.data)) return <p className="p-4 text-sm text-slate-600">{empty}</p>;
  return render(state.data);
}

/** One entry: main text on the left, actions on the right (below on a phone). */
export function EntryRow({ children, actions }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </li>
  );
}

export function EntryList({ children }) {
  return <ul className="divide-y divide-slate-200">{children}</ul>;
}
