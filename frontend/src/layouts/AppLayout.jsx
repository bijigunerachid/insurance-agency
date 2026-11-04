import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ArrowRightStartOnRectangleIcon,
  BookOpenIcon,
  CameraIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  HomeIcon,
  ScaleIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TruckIcon,
  UserGroupIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AgencyMark } from '../features/agency/AgencyBrand.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useRenewalAlerts } from '../features/renewals/useRenewalAlerts.js';
import { useWorkspace } from '../features/workspace/Workspace.jsx';
import { useWideScreen } from '../hooks/useWideScreen.js';
import { fr } from '../i18n/fr.js';

// Each item lists the permission it needs (null = every signed-in user). The API checks again.
// "daily" items are always shown (owner, 24/10/2026: an easy app for daily work); the others
// are under "Plus". On a phone the daily items form a bar at the bottom of the screen, under
// their short name (`short`).
export const NAV_ITEMS = [
  {
    to: '/accueil',
    label: fr.nav.home,
    Icon: HomeIcon,
    permission: 'renewals.read',
    daily: true,
  },
  {
    to: '/scans',
    label: fr.nav.scans,
    short: fr.nav.scansShort,
    Icon: CameraIcon,
    permission: 'scans.manage',
    daily: true,
  },
  {
    to: '/clients',
    label: fr.nav.customers,
    Icon: UserGroupIcon,
    permission: 'customers.read',
    daily: true,
  },
  {
    to: '/contrats',
    label: fr.nav.contracts,
    Icon: DocumentTextIcon,
    permission: 'contracts.read',
    daily: true,
  },
  {
    to: '/paiements',
    label: fr.nav.payments,
    Icon: BanknotesIcon,
    permission: 'payments.read',
    daily: true,
  },
  {
    to: '/renouvellements',
    label: fr.nav.renewals,
    Icon: ArrowPathIcon,
    permission: 'renewals.read',
  },
  { to: '/vehicules', label: fr.nav.vehicles, Icon: TruckIcon, permission: 'vehicles.read' },
  {
    to: '/reversements',
    label: fr.nav.remittances,
    Icon: BuildingLibraryIcon,
    permission: 'remittances.read',
  },
  { to: '/stock', label: fr.nav.stock, Icon: ArchiveBoxIcon, permission: 'stock.read' },
  { to: '/rapports', label: fr.nav.reports, Icon: ChartBarIcon, permission: 'reports.read' },
  { to: '/catalogue', label: fr.nav.catalogue, Icon: BookOpenIcon, permission: 'catalogue.read' },
  { to: '/regles', label: fr.nav.rules, Icon: ScaleIcon, permission: 'catalogue.read' },
  { to: '/utilisateurs', label: fr.nav.users, Icon: UsersIcon, permission: 'users.read' },
  {
    to: '/journal',
    label: fr.nav.audit,
    Icon: ClipboardDocumentListIcon,
    permission: 'audit.read',
  },
  {
    to: '/systeme',
    label: fr.nav.systemStatus,
    Icon: ServerStackIcon,
    permission: 'system.health',
  },
  { to: '/compte', label: fr.nav.account, Icon: UserCircleIcon, permission: null },
];

function NavItem({ to, label, Icon }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-700 ${
            isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
          }`
        }
      >
        <Icon aria-hidden="true" className="size-5" />
        {label}
      </NavLink>
    </li>
  );
}

/**
 * A daily page: in the side menu on a computer; on a phone, an icon over its short name in the
 * bar at the bottom of the screen. Its accessible name stays the full one.
 */
function DailyItem({ to, label, short, Icon }) {
  return (
    <li className="min-w-0 flex-1 md:flex-none">
      <NavLink
        to={to}
        aria-label={label}
        className={({ isActive }) =>
          `flex flex-col items-center gap-0.5 rounded-md px-0 py-1.5 text-[11px] tracking-tight font-medium focus-visible:outline-2 focus-visible:outline-blue-700 md:flex-row md:gap-2 md:whitespace-nowrap md:px-3 md:py-2 md:text-sm ${
            isActive
              ? 'text-blue-800 md:bg-blue-50'
              : 'text-slate-600 hover:bg-slate-100 md:text-slate-700'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span
              aria-hidden="true"
              className={`rounded-full px-3 py-0.5 md:p-0 ${isActive ? 'bg-blue-100 md:bg-transparent' : ''}`}
            >
              <Icon className="size-6 md:size-5" />
            </span>
            <span aria-hidden="true" className="max-w-full truncate md:hidden">
              {short ?? label}
            </span>
            <span aria-hidden="true" className="hidden md:inline">
              {label}
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}

/** The workspace in use, and the way back to the cards (to the home page, once chosen). */
function WorkspaceSwitch() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  if (!workspace.enabled) return null;
  const { insurer } = workspace;
  const current = insurer ? fr.workspace.current(insurer.code) : fr.workspace.currentBoth;
  // On a phone the code alone ("RMA"), so the agency's logo keeps its place.
  const short = insurer ? insurer.code : fr.workspace.currentBothShort;
  return (
    <button
      type="button"
      onClick={() => {
        navigate('/');
        workspace.change();
      }}
      aria-label={fr.workspace.changeLabel(current)}
      title={fr.workspace.change}
      style={{ '--brand': insurer?.colour ?? '#334155' }}
      className="inline-flex max-w-44 lg:max-w-none items-center gap-2 rounded-full border border-slate-300 bg-white py-1.5 pl-2 pr-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
    >
      <span
        aria-hidden="true"
        className={`size-3 shrink-0 rounded-full ${insurer ? 'bg-(--brand)' : 'bg-linear-to-r from-slate-400 to-slate-700'}`}
      />
      <span className="truncate sm:hidden">{short}</span>
      <span className="hidden truncate sm:inline">{current}</span>
      <ArrowsRightLeftIcon aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
    </button>
  );
}

export function AppLayout() {
  const { me, can, logout } = useAuth();
  const { insurer, enabled: workspaceShown } = useWorkspace();
  const { pathname } = useLocation();
  // Windows notifications for insurances ending, on every page while the app is open.
  useRenewalAlerts(can('renewals.read'));
  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
  const daily = items.filter((item) => item.daily);
  const more = items.filter((item) => !item.daily);
  // The page shown is one of "Plus": keep the panel open so the person sees where they are.
  const inMore = more.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  // The page "Plus" was opened on (null: closed).
  const [openedOn, setOpenedOn] = useState(null);
  const setOpenMore = (open) => setOpenedOn(open ? pathname : null);
  const wide = useWideScreen();
  // On a computer it stays open, as before. On a phone it is a panel over the page, open only
  // when asked and closed once another page is chosen.
  const openMore = wide ? openedOn !== null : openedOn === pathname;
  const moreShown = openMore || (wide && inMore);
  useEffect(() => {
    if (wide || !openMore) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') setOpenedOn(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [wide, openMore]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Aller au contenu
      </a>

      {/* The workspace's colour along the top of every page. */}
      <header
        style={insurer?.colour ? { borderTopColor: insurer.colour } : undefined}
        className={`border-b border-slate-200 bg-white print:hidden ${insurer ? 'border-t-4 border-t-slate-700' : ''}`}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <AgencyMark fallbackIcon={ShieldCheckIcon} />
          </div>
          <div className="flex items-center gap-3">
            <WorkspaceSwitch />
            {/* With the workspace button, a phone has no room for the name (the home page says it). */}
            <p
              className={`text-right text-sm leading-tight ${workspaceShown ? 'hidden sm:block' : ''}`}
            >
              <span className="sr-only">{fr.nav.signedInAs} </span>
              <span className="block font-medium">{me.user.displayName}</span>
              <span className="block text-xs text-slate-500">{me.user.role.name}</span>
            </p>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              <ArrowRightStartOnRectangleIcon aria-hidden="true" className="size-5" />
              <span className="sr-only sm:not-sr-only">{fr.nav.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col px-4 pb-28 pt-6 sm:px-6 md:flex-row md:gap-6 md:pb-6 print:block print:p-0">
        <nav aria-label={fr.nav.mainLabel} className="md:w-56 md:shrink-0 print:hidden">
          {/* A phone: the panel of "Plus" over the page, with a shade that closes it. */}
          {moreShown && !wide && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setOpenMore(false)}
              className="fixed inset-0 z-30 bg-slate-900/30 md:hidden"
            />
          )}
          <ul className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-slate-200 bg-white px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] md:static md:z-auto md:flex-col md:gap-1 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            {daily.map((item) => (
              <DailyItem key={item.to} {...item} />
            ))}
            {more.length > 0 && (
              <li className="min-w-0 flex-1 md:mt-2 md:flex-none">
                <button
                  type="button"
                  aria-expanded={moreShown}
                  aria-controls="nav-more"
                  onClick={() => setOpenMore(!moreShown)}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-md px-0 py-1.5 text-[11px] tracking-tight font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-700 md:flex-row md:gap-2 md:whitespace-nowrap md:px-3 md:py-2 md:text-sm md:text-slate-700 ${
                    inMore || moreShown ? 'text-blue-800' : 'text-slate-600'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`rounded-full px-3 py-0.5 md:p-0 ${inMore ? 'bg-blue-100 md:bg-transparent' : ''}`}
                  >
                    <Squares2X2Icon className="size-6 md:size-5" />
                  </span>
                  {fr.nav.more}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`ml-auto hidden size-4 transition-transform md:block ${moreShown ? 'rotate-180' : ''}`}
                  />
                </button>
              </li>
            )}
          </ul>
          {more.length > 0 && moreShown && (
            <ul
              id="nav-more"
              aria-label={fr.nav.moreLabel}
              className="fixed inset-x-0 bottom-[4.25rem] z-40 grid max-h-[70vh] grid-cols-2 gap-1 overflow-y-auto rounded-t-xl border-t border-slate-200 bg-white p-3 shadow-xl md:static md:mt-1 md:max-h-none md:grid-cols-1 md:overflow-visible md:rounded-none md:p-0 md:pt-2 md:shadow-none"
            >
              {more.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </ul>
          )}
        </nav>

        <main id="contenu" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
