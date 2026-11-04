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
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/20/solid';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AgencyMark, useAgencyBrand } from '../features/agency/AgencyBrand.jsx';
import { QuickSearch } from '../features/search/QuickSearch.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useRenewalAlerts } from '../features/renewals/useRenewalAlerts.js';
import { useWorkspace } from '../features/workspace/Workspace.jsx';
import { useWideScreen } from '../hooks/useWideScreen.js';
import { fr } from '../i18n/fr.js';

// Each item lists the permission it needs (null = every signed-in user). The API checks again.
// "daily" items are always shown (owner, 24/10/2026: an easy app for daily work); the others
// are under "Plus", in groups (`group`). On a phone the daily items form a bar at the bottom of
// the screen, under their short name (`short`).
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
    group: 'follow',
    label: fr.nav.renewals,
    Icon: ArrowPathIcon,
    permission: 'renewals.read',
  },
  {
    to: '/vehicules',
    group: 'reference',
    label: fr.nav.vehicles,
    Icon: TruckIcon,
    permission: 'vehicles.read',
  },
  {
    to: '/reversements',
    group: 'follow',
    label: fr.nav.remittances,
    Icon: BuildingLibraryIcon,
    permission: 'remittances.read',
  },
  {
    to: '/stock',
    group: 'follow',
    label: fr.nav.stock,
    Icon: ArchiveBoxIcon,
    permission: 'stock.read',
  },
  {
    to: '/rapports',
    group: 'follow',
    label: fr.nav.reports,
    Icon: ChartBarIcon,
    permission: 'reports.read',
  },
  {
    to: '/catalogue',
    group: 'reference',
    label: fr.nav.catalogue,
    Icon: BookOpenIcon,
    permission: 'catalogue.read',
  },
  {
    to: '/regles',
    group: 'reference',
    label: fr.nav.rules,
    Icon: ScaleIcon,
    permission: 'catalogue.read',
  },
  {
    to: '/utilisateurs',
    group: 'admin',
    label: fr.nav.users,
    Icon: UsersIcon,
    permission: 'users.read',
  },
  {
    to: '/journal',
    group: 'admin',
    label: fr.nav.audit,
    Icon: ClipboardDocumentListIcon,
    permission: 'audit.read',
  },
  {
    to: '/systeme',
    group: 'admin',
    label: fr.nav.systemStatus,
    Icon: ServerStackIcon,
    permission: 'system.health',
  },
  {
    to: '/compte',
    group: 'account',
    label: fr.nav.account,
    Icon: UserCircleIcon,
    permission: null,
  },
];

const GROUPS = ['follow', 'reference', 'admin', 'account'];
const SIDEBAR_KEY = 'agency.sidebar';

/** The side menu reduced to its icons, remembered in this browser (blocked storage: not kept). */
function useCollapsedSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, value ? 'open' : 'collapsed');
      } catch {
        // Not kept: the menu opens again at the next visit.
      }
      return !value;
    });
  return [collapsed, toggle];
}

const linkBase =
  'focus-ring group flex items-center gap-3 rounded-control text-sm font-medium transition-colors';
const linkState = ({ isActive }) =>
  isActive ? 'bg-primary-soft text-primary' : 'text-ink-soft hover:bg-sunken hover:text-ink';

/**
 * A page of the side menu (computer). Reduced, the label stays for screen readers and as the
 * tooltip; the current page has a coloured bar on its left.
 */
function SideLink({ to, label, Icon, collapsed }) {
  return (
    <li>
      <NavLink
        to={to}
        title={collapsed ? label : undefined}
        className={(state) =>
          `${linkBase} relative ${collapsed ? 'size-10 justify-center' : 'px-3 py-2'} ${linkState(state)}`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 -left-3 w-1 rounded-r bg-primary"
              />
            )}
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

/**
 * A daily page in the phone's bottom bar: an icon over its short name. Its accessible name
 * stays the full one.
 */
function BarLink({ to, label, short, Icon }) {
  return (
    <li className="min-w-0 flex-1">
      <NavLink
        to={to}
        aria-label={label}
        className={({ isActive }) =>
          `focus-ring flex flex-col items-center gap-0.5 rounded-control py-1.5 text-[11px] font-medium tracking-tight ${
            isActive ? 'text-primary' : 'text-ink-muted hover:text-ink'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span
              aria-hidden="true"
              className={`rounded-full px-3 py-0.5 ${isActive ? 'bg-primary-soft' : ''}`}
            >
              <Icon className="size-6" />
            </span>
            <span aria-hidden="true" className="max-w-full truncate">
              {short ?? label}
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}

/** The "Plus" pages by group (Suivi, Référentiel, Administration, Compte). */
function MoreGroups({ items, collapsed, onPick }) {
  return GROUPS.map((group) => {
    const inGroup = items.filter((item) => item.group === group);
    if (inGroup.length === 0) return null;
    return (
      <li key={group} className="pt-2 first:pt-0">
        {!collapsed && (
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {fr.nav.groups[group]}
          </p>
        )}
        <ul className={collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}>
          {inGroup.map((item) =>
            onPick ? (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onPick}
                  className={(state) => `${linkBase} px-3 py-2.5 ${linkState(state)}`}
                >
                  <item.Icon aria-hidden="true" className="size-5 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ) : (
              <SideLink key={item.to} {...item} collapsed={collapsed} />
            ),
          )}
        </ul>
      </li>
    );
  });
}

/** The workspace in use, and the way back to the cards (to the home page, once chosen). */
function WorkspaceSwitch({ variant = 'header' }) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  if (!workspace.enabled) return null;
  const { insurer } = workspace;
  const current = insurer ? fr.workspace.current(insurer.code) : fr.workspace.currentBoth;
  // On a phone the code alone ("RMA"), so the agency's logo keeps its place.
  const short = insurer ? insurer.code : fr.workspace.currentBothShort;
  const dot = (
    <span
      aria-hidden="true"
      className={`size-2.5 shrink-0 rounded-full ${insurer ? 'bg-(--brand)' : 'bg-linear-to-r from-ink-muted to-ink'}`}
    />
  );
  const common = {
    type: 'button',
    onClick: () => {
      navigate('/');
      workspace.change();
    },
    'aria-label': fr.workspace.changeLabel(current),
    title: fr.workspace.change,
    // A colour from the settings: a CSS variable, set through the DOM (allowed by the CSP).
    style: { '--brand': insurer?.colour ?? '#334155' },
  };
  if (variant === 'collapsed') {
    return (
      <button
        {...common}
        className="focus-ring flex size-10 items-center justify-center rounded-control hover:bg-sunken"
      >
        {dot}
      </button>
    );
  }
  if (variant === 'sidebar') {
    return (
      <button
        {...common}
        className="focus-ring flex w-full items-center gap-2.5 rounded-control border border-line bg-canvas px-3 py-2 text-left text-sm font-medium text-ink hover:border-line-strong/50 hover:bg-surface"
      >
        {dot}
        <span className="min-w-0 flex-1 truncate">{current}</span>
        <ArrowsRightLeftIcon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      </button>
    );
  }
  return (
    <button
      {...common}
      className="focus-ring inline-flex max-w-36 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2.5 pr-3 text-sm font-medium text-ink hover:bg-canvas"
    >
      {dot}
      <span className="truncate">{short}</span>
      <ArrowsRightLeftIcon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
    </button>
  );
}

/** The agency at the top of the side menu: its logo, or its icon when the menu is reduced. */
function SidebarBrand({ collapsed }) {
  const brand = useAgencyBrand();
  if (!collapsed) return <AgencyMark fallbackIcon={ShieldCheckIcon} />;
  return brand.icon ? (
    <img src="/api/agency/icon" alt={brand.name ?? fr.app.name} className="size-8 rounded" />
  ) : (
    <ShieldCheckIcon aria-label={brand.name ?? fr.app.name} className="size-8 text-primary" />
  );
}

export function AppLayout() {
  const { me, can, logout } = useAuth();
  const { insurer } = useWorkspace();
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
  const [collapsed, toggleCollapsed] = useCollapsedSidebar();
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

  const moreButton = (
    <button
      type="button"
      aria-expanded={moreShown}
      aria-controls="nav-more"
      onClick={() => setOpenMore(!moreShown)}
      title={collapsed ? fr.nav.more : undefined}
      className={`${linkBase} w-full ${collapsed ? 'size-10 justify-center' : 'px-3 py-2'} ${
        inMore ? 'text-primary' : 'text-ink-soft hover:bg-sunken hover:text-ink'
      }`}
    >
      <Squares2X2Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className={collapsed ? 'sr-only' : 'flex-1 text-left'}>{fr.nav.more}</span>
      {!collapsed && (
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-4 text-ink-muted transition-transform ${moreShown ? 'rotate-180' : ''}`}
        />
      )}
    </button>
  );

  const signOut = (
    <button
      type="button"
      onClick={logout}
      title={collapsed ? fr.nav.logout : undefined}
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-control text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink ${
        wide && !collapsed ? 'w-full px-3 py-2' : 'size-10'
      }`}
    >
      <ArrowRightStartOnRectangleIcon aria-hidden="true" className="size-5 shrink-0" />
      <span className={wide && !collapsed ? 'flex-1 text-left' : 'sr-only'}>{fr.nav.logout}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Aller au contenu
      </a>
      {/* The workspace's colour along the top of every page. */}
      {insurer?.colour && (
        <div
          aria-hidden="true"
          style={{ backgroundColor: insurer.colour }}
          className="fixed inset-x-0 top-0 z-50 h-1 print:hidden"
        />
      )}

      {wide && (
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface print:hidden ${
            collapsed ? 'w-16 items-center' : 'w-64'
          }`}
        >
          <div className={`flex h-16 shrink-0 items-center ${collapsed ? '' : 'gap-3 px-5'}`}>
            <SidebarBrand collapsed={collapsed} />
          </div>
          <div className={collapsed ? 'pb-2' : 'px-3 pb-3'}>
            <WorkspaceSwitch variant={collapsed ? 'collapsed' : 'sidebar'} />
          </div>
          <nav
            aria-label={fr.nav.mainLabel}
            className={`min-h-0 flex-1 overflow-y-auto pb-4 ${collapsed ? 'px-3' : 'px-3'}`}
          >
            <ul className={collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}>
              {daily.map((item) => (
                <SideLink key={item.to} {...item} collapsed={collapsed} />
              ))}
              {more.length > 0 && <li className="pt-3">{moreButton}</li>}
            </ul>
            {more.length > 0 && moreShown && (
              <ul
                id="nav-more"
                aria-label={fr.nav.moreLabel}
                className={`mt-1 ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1 pl-0'}`}
              >
                <MoreGroups items={more} collapsed={collapsed} />
              </ul>
            )}
          </nav>
          <div
            className={`shrink-0 border-t border-line py-3 ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1 px-3'}`}
          >
            {!collapsed && (
              <p className="px-3 pb-1 text-sm leading-tight">
                <span className="sr-only">{fr.nav.signedInAs} </span>
                <span className="block truncate font-medium text-ink">{me.user.displayName}</span>
                <span className="block truncate text-xs text-ink-muted">{me.user.role.name}</span>
              </p>
            )}
            {signOut}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-pressed={collapsed}
              title={collapsed ? fr.nav.expand : fr.nav.collapse}
              className={`focus-ring inline-flex items-center gap-2 rounded-control text-sm text-ink-muted hover:bg-sunken hover:text-ink ${
                collapsed ? 'size-10 justify-center' : 'w-full px-3 py-2'
              }`}
            >
              {collapsed ? (
                <ChevronDoubleRightIcon aria-hidden="true" className="size-4" />
              ) : (
                <ChevronDoubleLeftIcon aria-hidden="true" className="size-4" />
              )}
              <span className={collapsed ? 'sr-only' : ''}>{fr.nav.collapse}</span>
            </button>
          </div>
        </aside>
      )}

      <div className={wide ? (collapsed ? 'pl-16 print:pl-0' : 'pl-64 print:pl-0') : ''}>
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            {wide ? (
              <QuickSearch />
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <AgencyMark fallbackIcon={ShieldCheckIcon} />
                </div>
                <QuickSearch compact />
                <WorkspaceSwitch />
                {signOut}
              </>
            )}
          </div>
        </header>

        <main
          id="contenu"
          className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8 print:max-w-none print:p-0"
        >
          <Outlet />
        </main>
      </div>

      {!wide && (
        <nav aria-label={fr.nav.mainLabel} className="print:hidden">
          {/* The panel of "Plus" over the page, with a shade that closes it. */}
          {moreShown && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setOpenMore(false)}
              className="fixed inset-0 z-30 bg-ink/30"
            />
          )}
          <ul className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-line bg-surface px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-2px_8px_rgba(15,23,42,0.06)]">
            {daily.map((item) => (
              <BarLink key={item.to} {...item} />
            ))}
            {more.length > 0 && (
              <li className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={moreShown}
                  aria-controls="nav-more"
                  onClick={() => setOpenMore(!moreShown)}
                  className={`focus-ring flex w-full flex-col items-center gap-0.5 rounded-control py-1.5 text-[11px] font-medium tracking-tight ${
                    inMore || moreShown ? 'text-primary' : 'text-ink-muted'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`rounded-full px-3 py-0.5 ${inMore ? 'bg-primary-soft' : ''}`}
                  >
                    <Squares2X2Icon className="size-6" />
                  </span>
                  {fr.nav.more}
                </button>
              </li>
            )}
          </ul>
          {more.length > 0 && moreShown && (
            <ul
              id="nav-more"
              aria-label={fr.nav.moreLabel}
              className="fixed inset-x-0 bottom-[4.25rem] z-40 max-h-[70vh] space-y-1 overflow-y-auto rounded-t-[14px] border-t border-line bg-surface p-3 shadow-raised"
            >
              <MoreGroups items={more} onPick={() => setOpenMore(false)} />
            </ul>
          )}
        </nav>
      )}
    </div>
  );
}
