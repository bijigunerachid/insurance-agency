import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  BanknotesIcon,
  BellIcon,
  BuildingLibraryIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';
import { formatDateTime } from '../../utils/format.js';
import { notificationDetail, notificationText } from './notificationText.js';
import { useNotifications } from './Notifications.jsx';

const t = fr.notifications;
const ICONS = {
  ACTIVITY: UserGroupIcon,
  RENEWAL_DUE: ArrowPathIcon,
  UNPAID: BanknotesIcon,
  REMITTANCE_LATE: BuildingLibraryIcon,
  STOCK_LOW: ArchiveBoxIcon,
};
/** Alerts that ask for something to be done stand out from the team's activity. */
const TONES = {
  ACTIVITY: 'bg-sunken text-ink-soft',
  RENEWAL_DUE: 'bg-primary-soft text-primary',
  UNPAID: 'bg-warning-soft text-warning-ink',
  REMITTANCE_LATE: 'bg-danger-soft text-danger-ink',
  STOCK_LOW: 'bg-warning-soft text-warning-ink',
};

/** One alert: what happened, the last step for a renewal, when; it opens its page. */
export function NotificationLine({ notification, onOpen }) {
  const Icon = ICONS[notification.kind] ?? BellIcon;
  const detail = notificationDetail(notification);
  return (
    <Link
      to={notification.link}
      onClick={onOpen}
      className={`focus-ring flex gap-3 rounded-control px-3 py-2.5 text-sm hover:bg-sunken ${
        notification.unread ? 'bg-primary-soft/40' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${TONES[notification.kind]}`}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block break-words text-ink">
          {notificationText(notification, { you: notification.mine })}
        </span>
        {detail && <span className="block break-words text-xs text-ink-soft">{detail}</span>}
        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time>
          {notification.unread && (
            <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-white">
              {t.newBadge}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/**
 * The bell at the top of every page: how many alerts are new, and the latest ones in a panel.
 * Opening it marks them seen once they are shown. Escape or a click outside closes it.
 */
export function NotificationBell() {
  const { unread, available, markSeen } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const { state } = useApiQuery(open ? '/notifications?pageSize=8' : null);
  const loaded = open && state.status === 'done';

  // Seen once the panel has shown them (the « Nouveau » marks stay while it is open).
  useEffect(() => {
    if (loaded) markSeen();
  }, [loaded, markSeen]);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onPointer = (event) => {
      if (!panelRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t.bell(unread)}
        onClick={() => setOpen(!open)}
        className="focus-ring relative flex size-9 items-center justify-center rounded-control text-ink-soft hover:bg-sunken hover:text-ink"
      >
        <BellIcon aria-hidden="true" className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-surface"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label={t.panel}
          tabIndex={-1}
          className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface shadow-raised focus:outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{t.panel}</h2>
            <Link
              to="/notifications"
              onClick={close}
              className="focus-ring rounded-control text-sm font-medium text-primary hover:text-primary-hover"
            >
              {t.seeAll}
            </Link>
          </div>
          {!available && <p className="px-4 pt-3 text-xs text-ink-muted">{t.unavailable}</p>}
          {state.status === 'loading' && (
            <p className="px-4 py-6 text-sm text-ink-muted">{fr.app.loading}</p>
          )}
          {state.status === 'error' && (
            <p className="px-4 py-6 text-sm text-ink-muted">{t.unavailable}</p>
          )}
          {state.status === 'done' && state.data.items.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-muted">{t.none}</p>
          )}
          {state.status === 'done' && state.data.items.length > 0 && (
            <ul className="space-y-0.5 p-2">
              {state.data.items.map((n) => (
                <li key={n.id}>
                  <NotificationLine notification={n} onOpen={close} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
