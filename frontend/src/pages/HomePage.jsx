import {
  ArrowPathIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  CameraIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/Alert.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { AlertsSwitch } from '../features/renewals/AlertsSwitch.jsx';
import { RenewalList } from '../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { errorMessage, fr } from '../i18n/fr.js';
import { formatDate, formatMoney } from '../utils/format.js';
import { useInsurerFilter } from '../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../features/workspace/WorkspaceNotice.jsx';

const t = fr.home;
const SEARCH_DELAY_MS = 300;

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
  const [query, setQuery] = useState('');
  // Searches once the person stops typing, not at every letter.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // In one insurer's workspace: its clients, vehicles and contracts (and those without any).
  const params = useInsurerFilter().apply(new URLSearchParams({ q: query }));
  const results = useApiQuery(query.length >= 2 ? `/search?${params}` : null);
  const data = results.state.status === 'done' && query.length >= 2 ? results.state.data : null;
  const count = data ? data.customers.length + data.vehicles.length + data.contracts.length : 0;

  return (
    <section
      role="search"
      aria-labelledby={`${id}-label`}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-slate-800">
        {t.search}
      </label>
      <div className="relative">
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400"
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
          className="block w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-base text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-0 focus:outline-blue-700"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        {t.searchHint}
      </p>
      <div aria-live="polite">
        {query.length >= 2 && results.state.status === 'loading' && <Spinner label={t.searching} />}
        {results.state.status === 'error' && <Alert>{errorMessage(results.state.error)}</Alert>}
        {data && count === 0 && <p className="text-sm text-slate-600">{t.noResult}</p>}
        {data && count > 0 && (
          <div className="space-y-3">
            <ResultGroup title={t.results.customers} items={data.customers}>
              {(c) => (
                <Link to={`/clients/${c.id}`} className="block p-2 hover:bg-slate-50">
                  <span className="font-medium text-blue-700">{c.displayName}</span>{' '}
                  <span className="text-xs text-slate-600">
                    {c.ref}
                    {c.city && ` · ${c.city}`}
                  </span>
                </Link>
              )}
            </ResultGroup>
            <ResultGroup title={t.results.vehicles} items={data.vehicles}>
              {(v) => (
                <Link to={`/vehicules/${v.id}`} className="block p-2 hover:bg-slate-50">
                  <span className="font-mono font-medium text-blue-700">{v.registration}</span>{' '}
                  <span className="text-xs text-slate-600">
                    {v.makeAndModel} · {v.owner}
                  </span>
                </Link>
              )}
            </ResultGroup>
            <ResultGroup title={t.results.contracts} items={data.contracts}>
              {(c) => (
                <Link to={`/contrats/${c.id}`} className="block p-2 hover:bg-slate-50">
                  <span className="font-mono font-medium text-blue-700">{c.ref}</span>{' '}
                  <span className="text-xs text-slate-600">
                    {c.customer} · {c.insurer}
                    {c.policyNumber && ` · ${c.policyNumber}`} · {fr.contracts.statuses[c.status]} ·{' '}
                    {formatDate(c.endDate)}
                  </span>
                </Link>
              )}
            </ResultGroup>
          </div>
        )}
      </div>
    </section>
  );
}

function ResultGroup({ title, items, children }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {items.map((item) => (
          <li key={item.id}>{children(item)}</li>
        ))}
      </ul>
    </div>
  );
}
