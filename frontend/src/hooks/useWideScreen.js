import { useEffect, useState } from 'react';

const QUERY = '(min-width: 768px)';
/** Tailwind « lg »: room for the sign-in page's side panel. */
export const LARGE_QUERY = '(min-width: 1024px)';

/**
 * True on a computer-wide screen (Tailwind « md », or the query given); a test without
 * matchMedia counts as one.
 */
export function useWideScreen(query = QUERY) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [wide, setWide] = useState(() => !supported || window.matchMedia(query).matches);
  useEffect(() => {
    if (!supported) return undefined;
    const list = window.matchMedia(query);
    const update = () => setWide(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [supported, query]);
  return wide;
}
