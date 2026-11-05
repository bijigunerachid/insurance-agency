import { ChevronRightIcon } from '@heroicons/react/20/solid';

/**
 * Details folded until asked for (a record's less used facts, its history): the browser's own
 * <details>, so it opens with Enter or Space and is announced as expandable.
 */
export function Disclosure({ title, children }) {
  return (
    <details className="group overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-section text-ink hover:bg-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-5 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {title}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
