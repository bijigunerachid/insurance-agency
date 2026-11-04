import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet } from '../../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

/** The choice of this browser tab, cleared on sign-out: the screen is shown after each sign-in. */
const STORAGE_KEY = 'agency.workspace';
/** Both insurers, as before the workspace screen. */
export const BOTH = 'ALL';

// Storage blocked (private window, settings): the choice lasts until the page is reloaded.
let inMemory = null;

function readChoice(userId) {
  let saved = inMemory;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    // Kept in memory instead.
  }
  return saved?.userId === userId ? saved.insurerId : null;
}
function writeChoice(value) {
  inMemory = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Kept in memory instead.
  }
}

const WorkspaceContext = createContext(null);

/**
 * The workspace chosen after sign-in (owner, 04/11/2026): one insurer of the catalogue, or both.
 * It only filters the lists on screen; every user may see every insurer and the API checks each
 * permission. The screen is offered to the people who follow contracts, when the agency works
 * with more than one insurer; otherwise both are shown, as before.
 */
export function WorkspaceProvider({ children }) {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in' && auth.me.stage === 'ACTIVE';
  const userId = signedIn ? auth.me.user.id : null;
  const offered = signedIn && auth.can('contracts.read');
  // The cards of the signed-in user: { userId, items }.
  const [list, setList] = useState(null);
  // Bumped on each choice: the choice itself is read from the tab's storage.
  const [, setChoices] = useState(0);

  // Signed out (or the session ended): the next sign-in starts on the cards again.
  useEffect(() => {
    if (auth.status === 'anonymous') writeChoice(null);
  }, [auth.status]);

  useEffect(() => {
    if (!offered) return undefined;
    let live = true;
    apiGet('/workspaces')
      .then((data) => live && setList({ userId, items: data.items }))
      // Without the cards the lists show both insurers, as before.
      .catch(() => live && setList({ userId, items: [] }));
    return () => {
      live = false;
    };
  }, [offered, userId]);

  const choose = useCallback(
    (insurerId) => {
      writeChoice(insurerId ? { userId, insurerId } : null);
      setChoices((n) => n + 1);
    },
    [userId],
  );

  // Read on each render (cheap): the storage holds the choice, `setChoices` asks for a render.
  const loaded = list?.userId === userId;
  const items = loaded ? list.items : [];
  const enabled = offered && items.length > 1;
  const saved = readChoice(userId);
  const current = items.find((item) => item.id === saved) ?? null;
  const value = {
    loading: offered && !loaded,
    /** The cards are offered (more than one active insurer). */
    enabled,
    items,
    /** A card must be chosen before the application opens. */
    mustChoose: enabled && saved !== BOTH && current === null,
    /** The insurer chosen, or null for both. */
    insurer: enabled ? current : null,
    choose,
    /** Back to the cards. */
    change: () => choose(null),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
}

/** Adds the chosen insurer to a list's query (URLSearchParams), when one is chosen. */
export function useInsurerFilter() {
  const { insurer } = useWorkspace();
  return {
    insurer,
    apply(params) {
      if (insurer) params.set('insurerId', insurer.id);
      return params;
    },
    /** For a path without other parameters. */
    path(base) {
      return insurer ? `${base}?insurerId=${insurer.id}` : base;
    },
  };
}
