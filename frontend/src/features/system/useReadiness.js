import { useApiQuery } from '../../hooks/useApiQuery.js';

/**
 * Loads /api/system/status (signed-in view of readiness). A 503 still means the server
 * answered, so it is data, not an error.
 */
export function useReadiness() {
  const { state, reload } = useApiQuery('/system/status', { acceptStatuses: [503] });
  const adapted =
    state.status === 'done'
      ? { status: 'done', data: state.data, checkedAt: state.loadedAt }
      : state;
  return { state: adapted, refresh: () => reload() };
}
