import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiGet, apiPost, setCsrfToken, setUnauthenticatedHandler } from '../../services/api.js';

const AuthContext = createContext(null);

/**
 * Holds who is signed in. The server is the authority: this state only decides which screen
 * to show; every permission is checked again by the API.
 * state.status: 'loading' | 'anonymous' | 'signed-in' (then state.me.stage says what is next)
 */
/** Loads the profile; returns a state updater (keeps any notice when signed out). */
async function fetchMe() {
  try {
    const me = await apiGet('/auth/me');
    if (!me.authenticated) {
      setCsrfToken(null);
      return (previous) => ({ status: 'anonymous', me: null, notice: previous.notice });
    }
    setCsrfToken(me.csrfToken);
    return () => ({ status: 'signed-in', me, notice: null });
  } catch (error) {
    setCsrfToken(null);
    return () => ({ status: 'error', me: null, notice: null, error });
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', me: null, notice: null });

  const refresh = useCallback(async () => setState(await fetchMe()), []);
  // True while « Se déconnecter » runs: the page's requests still on their way come back 401.
  const signingOut = useRef(false);

  useEffect(() => {
    // Any later 401 means the session ended (expiry, logout elsewhere, account disabled), unless
    // the person is signing out or already signed out: a late answer to a request sent just
    // before must not replace « Vous êtes déconnecté » with « Votre session a pris fin ».
    setUnauthenticatedHandler(() => {
      if (signingOut.current) return;
      setCsrfToken(null);
      setState((previous) =>
        previous.status === 'anonymous'
          ? previous
          : { status: 'anonymous', me: null, notice: 'SESSION_ENDED' },
      );
    });
    fetchMe().then(setState);
    return () => setUnauthenticatedHandler(null);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      /** Apply the result of a sign-in step ({ stage, csrfToken }) and reload the profile. */
      async advance(result) {
        setCsrfToken(result.csrfToken);
        await refresh();
      },
      async login(username, password) {
        const result = await apiPost('/auth/login', { username, password });
        setCsrfToken(result.csrfToken);
        await refresh();
      },
      async logout() {
        signingOut.current = true;
        try {
          await apiPost('/auth/logout');
        } catch {
          // The server session may already be gone; the browser side ends either way.
        } finally {
          setCsrfToken(null);
          setState({ status: 'anonymous', me: null, notice: 'SIGNED_OUT' });
          signingOut.current = false;
        }
      },
      can(permission) {
        return state.me?.stage === 'ACTIVE' && state.me.user.permissions.includes(permission);
      },
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
