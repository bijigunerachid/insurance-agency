import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { fr } from '../../i18n/fr.js';
import { apiGet } from '../../services/api.js';

const t = fr.alerts;
export const ALERT_CHECK_MS = 5 * 60 * 1000;
const FIRST_CHECK_MS = 3000;
const STORAGE_KEY = 'agence.renewalAlerts.last';

/** True when this browser can show Windows notifications for the app. */
export function alertsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function lastShown() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private window or blocked storage: the alert may come again, nothing breaks
  }
}

function remember(key) {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Same as above.
  }
}

/**
 * While the app is open (even in a background tab), checks every 5 minutes whether insurances
 * of this employee are ending, and shows a Windows notification (owner, 24/10/2026). Once a
 * day, and again only when the numbers change. Counts only: the notification may show on a
 * shared or locked screen, so no customer name. Clicking it opens the renewals.
 */
export function useRenewalAlerts(enabled) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !alertsSupported()) return undefined;
    let stopped = false;

    async function check() {
      if (stopped || window.Notification.permission !== 'granted') return;
      let todo;
      try {
        todo = await apiGet('/today');
      } catch {
        return; // offline or signed out: try again at the next check
      }
      const late = todo.items.find((i) => i.kind === 'RENEWALS_LATE')?.count ?? 0;
      const due = todo.items.find((i) => i.kind === 'RENEWALS');
      const count = due?.count ?? 0;
      const soon = due?.soon ?? 0;
      if (late === 0 && count === 0) return;
      const key = `${todo.today}|${count}|${soon}|${late}`;
      if (key === lastShown()) return;
      remember(key);
      const notification = new window.Notification(t.title, {
        body: [late ? t.late(late) : null, count ? t.due(count, soon) : null]
          .filter(Boolean)
          .join('\n'),
        tag: 'renouvellements',
        lang: 'fr',
      });
      notification.onclick = () => {
        window.focus();
        navigate('/renouvellements');
        notification.close();
      };
    }

    const first = setTimeout(check, FIRST_CHECK_MS);
    const every = setInterval(check, ALERT_CHECK_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [enabled, navigate]);
}
