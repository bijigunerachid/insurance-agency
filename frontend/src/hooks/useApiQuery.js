import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../services/api.js';

/**
 * Loads `path` from the API and reloads when it changes. A null path loads nothing.
 * state: { status: 'loading' } | { status: 'done', data, loadedAt } | { status: 'error', error }
 */
export function useApiQuery(path, { acceptStatuses } = {}) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const accepted = acceptStatuses?.join(',');

  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    apiGet(path, {
      signal: controller.signal,
      acceptStatuses: accepted ? accepted.split(',').map(Number) : [],
    })
      .then((data) => setState({ status: 'done', data, loadedAt: new Date() }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', error });
      });
    return () => controller.abort();
  }, [path, accepted, attempt]);

  /**
   * Loads again. With { silent: true } the current data stays on screen until the new data
   * arrives, so dialogs and messages in the page are not unmounted.
   */
  const reload = useCallback(({ silent = false } = {}) => {
    if (!silent) setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}
