import { AdjustmentsHorizontalIcon } from '@heroicons/react/20/solid';
import { useId, useState } from 'react';
import { useWideScreen } from '../hooks/useWideScreen.js';
import { fr } from '../i18n/fr.js';

/**
 * The filters beside a search box: in line on a computer; on a phone behind one « Filtres »
 * button that says how many are set, so the search box and the results stay in reach.
 */
export function MoreFilters({ active = 0, children }) {
  const wide = useWideScreen();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (wide) return <div className="contents">{children}</div>;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 justify-self-start rounded-md py-1 text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700"
      >
        <AdjustmentsHorizontalIcon aria-hidden="true" className="size-4" />
        {fr.common.filters(active)}
      </button>
      <div id={id} hidden={!open} className="grid gap-3">
        {children}
      </div>
    </>
  );
}
