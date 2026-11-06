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
import { apiGet, apiPost } from '../../services/api.js';
import { notificationText } from './notificationText.js';

/** How often the bell asks what is new while the page is in front (owner, 05/11/2026). */
export const POLL_MS = 30_000;
/** At most this many pop-ups at once; the others wait in the bell. */
const POPUPS = 3;

const NotificationsContext = createContext(null);

/**
 * The bell's count and the pop-ups: asks the server every 30 seconds while the tab is shown, and
 * at once when the person comes back to it. What arrived since the last answer pops up (never
 * what was already there when the page opened, nor one's own actions: the server leaves those out).
 */
export function NotificationsProvider({ children }) {
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [available, setAvailable] = useState(true);
  // The newest alert known: null until the first answer.
  const known = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet('/notifications/summary');
      if (known.current !== null) {
        const fresh = data.recent
          .filter((n) => Number(n.id) > Number(known.current))
          .slice(0, POPUPS)
          .reverse();
        for (const n of fresh) {
          toast.show(
            <Link to={n.link} className="hover:underline">
              {notificationText(n)}
            </Link>,
            { tone: 'info' },
          );
        }
      }
      known.current = data.latestId ?? known.current ?? '0';
      setUnread(data.unread);
      setAvailable(true);
    } catch {
      // Tried again at the next turn; the bell says it could not check.
      setAvailable(false);
    }
  }, [toast]);

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
