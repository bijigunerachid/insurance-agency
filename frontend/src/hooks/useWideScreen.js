import { useEffect, useState } from 'react';

const QUERY = '(min-width: 768px)';

/** True on a computer-wide screen (Tailwind « md »); a test without matchMedia counts as one. */
export function useWideScreen() {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [wide, setWide] = useState(() => !supported || window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (!supported) return undefined;
    const list = window.matchMedia(QUERY);
    const update = () => setWide(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [supported]);
  return wide;
}
