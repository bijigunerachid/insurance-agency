import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { useEffect, useId, useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { fr } from '../../i18n/fr.js';
import { SearchResults, useGlobalSearch } from './GlobalSearch.jsx';

/** The search of the home page, from any page: a dialog the person opens and leaves. */
function QuickSearchDialog({ onClose }) {
  const id = useId();
  const [text, setText] = useState('');
  const { query, results } = useGlobalSearch(text);
  return (
    <Dialog title={fr.nav.quickSearch} onClose={onClose}>
      <div role="search" className="space-y-3">
        <label htmlFor={id} className="sr-only">
          {fr.nav.quickSearch}
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
          />
          <input
            id={id}
            data-autofocus
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={fr.home.searchPlaceholder}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            maxLength={80}
            className="block h-11 w-full rounded-control border border-line-strong/70 bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30"
          />
        </div>
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {fr.home.searchHint}
        </p>
        <div className="max-h-[50vh] overflow-y-auto">
          <SearchResults query={query} results={results} onPick={onClose} />
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The header's search: a wide button on a computer (« Recherche rapide · Ctrl K »), an icon on a
 * phone. Ctrl+K (or ⌘K) opens it from anywhere in the application.
 */
export function QuickSearch({ compact = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K"
        title={fr.nav.quickSearchHint}
        className={
          compact
            ? 'focus-ring inline-flex size-10 items-center justify-center rounded-control text-ink-soft hover:bg-sunken'
            : // An icon on a narrow computer screen, the wide box from 1280 px.
              'focus-ring inline-flex size-10 items-center justify-center rounded-control text-ink-soft hover:bg-sunken xl:h-9 xl:w-full xl:max-w-md xl:justify-start xl:gap-2 xl:border xl:border-line xl:bg-canvas xl:px-3 xl:text-sm xl:text-ink-muted xl:hover:border-line-strong/60 xl:hover:bg-surface'
        }
      >
        <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className={compact ? 'sr-only' : 'sr-only xl:not-sr-only xl:flex-1 xl:text-left'}>
          {fr.nav.quickSearch}
        </span>
        {!compact && (
          <kbd
            aria-hidden="true"
            className="hidden rounded border border-line bg-surface px-1.5 font-sans text-[11px] text-ink-muted xl:inline"
          >
            {fr.nav.quickSearchShortcut}
          </kbd>
        )}
      </button>
      {open && <QuickSearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}
