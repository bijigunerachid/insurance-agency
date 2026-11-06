import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { useToast } from '../../components/Toast.jsx';
import { fr } from '../../i18n/fr.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPost } from '../../services/api.js';
import { notificationText } from './notificationText.js';

/** How often the bell asks what is new while the page is in front (owner, 05/11/2026). */
export const POLL_MS = 30_000;
/** At most this many pop-ups at once; the others wait in the bell. */
const POPUPS = 3;
/** Pop-ups after sign-in come one after the other, so each one is seen arriving. */
export const POPUP_GAP_MS = 700;
/** The newest alert already popped up in this tab, so a page reload does not show it again. */
const STORAGE_KEY = 'agency.notifications.popped';

function lastPopped(userId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return saved?.userId === userId ? saved.id : null;
  } catch {
    return null; // storage blocked: after a reload the new alerts may pop up again, nothing breaks
  }
}
function rememberPopped(userId, id) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, id }));
  } catch {
    // Same as above.
  }
}

const NotificationsContext = createContext(null);

/**
 * The bell's count and the pop-ups: asks the server every 30 seconds while the tab is shown, and
 * at once when the person comes back to it. After sign-in, what is new pops up one after the
 * other and goes away by itself, like any message (owner, 06/11/2026); then what arrives while
 * working. Never one's own actions (the server leaves those out), never twice in the same tab.
 */
export function NotificationsProvider({ children }) {
  const toast = useToast();
  const { me } = useAuth();
  const userId = me?.user?.id ?? null;
  const [unread, setUnread] = useState(0);
  const [available, setAvailable] = useState(true);
  // The newest alert known: null until the first answer.
  const known = useRef(null);
  // The pop-ups waiting their turn after sign-in.
  const timers = useRef([]);

  const pop = useCallback(
    (n) =>
      toast.show(
        <Link to={n.link} className="hover:underline">
          {notificationText(n)}
        </Link>,
        { tone: 'info' },
      ),
    [toast],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet('/notifications/summary');
      const first = known.current === null;
      // First answer: what is new and was not popped up yet in this tab; then what arrived since.
      const since = first ? lastPopped(userId) : known.current;
      const fresh = data.recent
        .filter((n) => since === null || Number(n.id) > Number(since))
        .slice(0, POPUPS)
        .reverse();
      if (first) {
        // One after the other; a last one says how many more wait in the bell.
        const rest = data.unread - fresh.length;
        const all = [
          ...fresh.map((n) => () => pop(n)),
          ...(fresh.length > 0 && rest > 0
            ? [
                () =>
                  toast.show(
                    <Link to="/notifications" className="hover:underline">
                      {fr.notifications.more(rest)}
                    </Link>,
                    { tone: 'info' },
                  ),
              ]
            : []),
        ];
        timers.current = all.map((show, index) => setTimeout(show, index * POPUP_GAP_MS));
      } else {
        fresh.forEach(pop);
      }
      if (data.recent.length > 0) rememberPopped(userId, data.recent[0].id);
      known.current = data.latestId ?? known.current ?? '0';
      setUnread(data.unread);
      setAvailable(true);
    } catch {
      // Tried again at the next turn; the bell says it could not check.
      setAvailable(false);
    }
  }, [pop, toast, userId]);

  useEffect(() => {
    // The first check right after the page is drawn, then every 30 seconds.
    const first = setTimeout(refresh, 0);
    const shown = () => document.visibilityState === 'visible';
    const timer = setInterval(() => shown() && refresh(), POLL_MS);
    const onVisible = () => shown() && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      for (const waiting of timers.current) clearTimeout(waiting);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const markSeen = useCallback(async () => {
    setUnread(0);
    try {
      await apiPost('/notifications/seen', {});
    } catch {
      // The count comes back at the next turn.
    }
  }, []);

  const value = useMemo(
    () => ({ unread, available, refresh, markSeen }),
    [unread, available, refresh, markSeen],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
