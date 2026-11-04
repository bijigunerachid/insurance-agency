import {
  ArrowPathIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  CameraIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/Alert.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { AlertsSwitch } from '../features/renewals/AlertsSwitch.jsx';
import { RenewalList } from '../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { errorMessage, fr } from '../i18n/fr.js';
import { formatMoney } from '../utils/format.js';
import { SearchResults, useGlobalSearch } from '../features/search/GlobalSearch.jsx';
import { useInsurerFilter } from '../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../features/workspace/WorkspaceNotice.jsx';

const t = fr.home;

/** Items whose amount is shown in MAD. */
const withMoney = (item) => (item.amount ? { ...item, amount: formatMoney(item.amount) } : item);

const ICONS = {
  SCANS: CameraIcon,
  RENEWALS: ArrowPathIcon,
  RENEWALS_LATE: ArrowPathIcon,
  UNPAID: BanknotesIcon,
  REMITTANCE_LATE: BuildingLibraryIcon,
  PROVISIONAL_ENDING: DocumentTextIcon,
};
/** Late first: a remittance or a renewal past its date, money owed for long. */
const isLate = (item) =>
  ['REMITTANCE_LATE', 'RENEWALS_LATE'].includes(item.kind) ||
  (item.kind === 'UNPAID' && item.old > 0);
const byUrgency = (items) => [...items.filter(isLate), ...items.filter((i) => !isLate(i))];

/**
 * "Aujourd'hui" (owner, 24/10/2026: an easy app for daily work): scan an attestation, find
 * anything with one search box, and see what is waiting. Each line opens the right page.
 */
export function HomePage() {
  const { me, can } = useAuth();
  const filter = useInsurerFilter();
  const todo = useApiQuery(filter.path('/today'));
  const renewals = useApiQuery(can('renewals.read') ? filter.path('/renewals/summary') : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.hello(me.user.displayName)}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>
      <WorkspaceNotice />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {can('scans.manage') && (
          <Link
            to="/scans"
            className="flex items-center gap-4 rounded-xl bg-blue-700 p-5 text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <CameraIcon aria-hidden="true" className="size-10 shrink-0" />
            <span>
              <span className="block text-lg font-semibold">{t.scan}</span>
              <span className="block text-sm text-blue-100">{t.scanHint}</span>
            </span>
          </Link>
        )}
        <SearchBox />
      </div>

      <section aria-labelledby="todo-heading" className="space-y-3">
        <h2 id="todo-heading" className="text-lg font-semibold">
          {t.todo}
        </h2>
        {todo.state.status === 'loading' && <Spinner label={fr.app.loading} />}
        {todo.state.status === 'error' && <Alert>{errorMessage(todo.state.error)}</Alert>}
        {todo.state.status === 'done' &&
          (todo.state.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
              {t.nothingToDo}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {byUrgency(todo.state.data.items).map((item) => {
                const late = isLate(item);
                const Icon = ICONS[item.kind] ?? DocumentTextIcon;
                return (
                  <li key={`${item.kind}-${item.insurer ?? ''}`}>
                    <Link
                      to={item.to}
                      className={`flex items-center gap-3 p-4 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700 ${
                        late ? 'border-l-4 border-red-600 pl-3' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                          late ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {late && (
                          // Visual only: the line itself says it is late.
                          <span
                            aria-hidden="true"
                            className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-red-700"
                          >
                            {t.late}
                          </span>
                        )}
                        {t.todoItems[item.kind](withMoney(item))}
                      </span>
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-slate-400"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        {can('renewals.read') && <AlertsSwitch />}
      </section>

      {renewals.state.status === 'done' && renewals.state.data.next.length > 0 && (
        <section aria-labelledby="next-renewals" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="next-renewals" className="text-lg font-semibold">
              {t.next}
            </h2>
            <Link to="/renouvellements" className="text-sm font-medium text-blue-700 underline">
              {t.seeAll}
            </Link>
          </div>
          <RenewalList renewals={renewals.state.data.next.slice(0, 5)} />
        </section>
      )}
    </div>
  );
}

/** One box for everything: name, CIN, plate, policy or attestation number. */
function SearchBox() {
  const id = useId();
  const [text, setText] = useState('');
  const { query, results } = useGlobalSearch(text);

  return (
    <section
      role="search"
      aria-labelledby={`${id}-label`}
      className="space-y-2 rounded-card border border-line bg-surface p-4 shadow-hairline"
    >
      <label id={`${id}-label`} htmlFor={id} className="block text-label text-ink-soft">
        {t.search}
      </label>
      <div className="relative">
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
        />
        <input
          id={id}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          maxLength={80}
          className="block h-11 w-full rounded-control border border-line-strong/70 bg-surface pl-10 pr-3 text-base text-ink shadow-hairline placeholder:text-ink-muted focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-muted">
        {t.searchHint}
      </p>
      <SearchResults query={query} results={results} />
    </section>
  );
}
