import {
  ArrowPathIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/Alert.jsx';
import { Card } from '../components/Card.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { SegmentedControl } from '../components/SegmentedControl.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { AlertsSwitch } from '../features/renewals/AlertsSwitch.jsx';
import { RenewalList } from '../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { errorMessage, fr } from '../i18n/fr.js';
import { formatLongDate, formatMoney } from '../utils/format.js';
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
  // The agency's day, as the server counts it (its time zone), once known.
  const today = todo.state.status === 'done' ? todo.state.data.today : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.hello(me.user.displayName)}
        description={t.intro}
        meta={
          today && (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <CalendarDaysIcon aria-hidden="true" className="size-4 text-ink-muted" />
              {formatLongDate(today)}
            </span>
          )
        }
      />
      <WorkspaceNotice />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,24rem)_1fr]">
        {can('scans.manage') && <ScanAction />}
        <SearchBox />
      </div>

      <div className="space-y-3">
        <TodoCard query={todo} />
        {can('renewals.read') && <AlertsSwitch />}
      </div>

      {can('renewals.read') && <NextRenewals query={renewals} meId={me.user.id} />}
    </div>
  );
}

/** The first thing of the day: a document from the platform to read into the app. */
function ScanAction() {
  return (
    <Link
      to="/scans"
      className="focus-ring group flex items-center gap-4 rounded-card bg-primary p-5 text-white shadow-raised transition-colors hover:bg-primary-hover"
    >
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-card bg-white/15"
      >
        <CameraIcon className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{t.scan}</span>
        <span className="mt-0.5 block text-sm text-white/80">{t.scanHint}</span>
      </span>
      <ArrowRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

/** What is waiting, late first; each line opens the page where it is done. */
function TodoCard({ query }) {
  const { state } = query;
  const items = state.status === 'done' ? byUrgency(state.data.items) : [];
  const lateCount = items.filter(isLate).length;
  return (
    <Card
      title={t.todo}
      flush
      actions={lateCount > 0 && <StatusBadge tone="error">{t.lateCount(lateCount)}</StatusBadge>}
    >
      {state.status === 'loading' && <SkeletonList rows={3} flush />}
      {state.status === 'error' && (
        <div className="p-4 sm:p-5">
          <Alert>{errorMessage(state.error)}</Alert>
        </div>
      )}
      {state.status === 'done' &&
        (items.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-ink-soft">
            <CheckCircleIcon aria-hidden="true" className="size-5 text-success" />
            {t.nothingToDo}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <TodoLine key={`${item.kind}-${item.insurer ?? ''}`} item={item} />
            ))}
          </ul>
        ))}
    </Card>
  );
}

function TodoLine({ item }) {
  const late = isLate(item);
  const Icon = ICONS[item.kind] ?? DocumentTextIcon;
  return (
    <li className="relative">
      {late && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-danger" />}
      <Link
        to={item.to}
        // Inside the card (which clips): the focus ring is drawn on the inner edge.
        className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-ink hover:bg-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
      >
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-control ${
            late ? 'bg-danger-soft text-danger-ink' : 'bg-warning-soft text-warning-ink'
          }`}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          {late && (
            // Visual only: the line itself says it is late.
            <span
              aria-hidden="true"
              className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-danger-ink"
            >
              {t.late}
            </span>
          )}
          {t.todoItems[item.kind](withMoney(item))}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

/**
 * The agency's next renewals (five), each with who follows it, for everyone (owner, 06/11/2026);
 * « Les miens » shows the person's own. The way to all of them.
 */
function NextRenewals({ query, meId }) {
  const { state } = query;
  const [whose, setWhose] = useState('all');
  const list =
    state.status === 'done'
      ? whose === 'all'
        ? state.data.next
        : (state.data.nextMine ?? [])
      : [];
  return (
    <Card
      title={t.next}
      flush
      actions={
        <Link
          to="/renouvellements"
          className="focus-ring inline-flex items-center gap-1 rounded-control text-sm font-medium text-primary hover:text-primary-hover hover:underline"
        >
          {t.seeAll}
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      {state.status === 'loading' && <SkeletonList rows={3} flush />}
      {state.status === 'error' && (
        <div className="p-4 sm:p-5">
          <Alert>{errorMessage(state.error)}</Alert>
        </div>
      )}
      {state.status === 'done' && (
        <>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <SegmentedControl
              label={t.whose}
              value={whose}
              onChange={setWhose}
              options={[
                { value: 'all', label: t.whoseOptions.all },
                { value: 'mine', label: t.whoseOptions.mine },
              ]}
            />
          </div>
          {list.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              {whose === 'all' ? t.none : t.noneMine}
            </p>
          ) : (
            <RenewalList renewals={list.slice(0, 5)} flush meId={meId} />
          )}
        </>
      )}
    </Card>
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
      className="space-y-2 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5"
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
