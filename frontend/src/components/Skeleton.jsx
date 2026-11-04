import { fr } from '../i18n/fr.js';

/** A grey shape where text will appear (decoration only: the list says it is loading). */
export function Skeleton({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-control bg-sunken motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * A list being loaded: the shape of its rows, so the page does not jump when the data arrives.
 * Read as « Chargement… » by screen readers. `flush`: inside a card, without its own border.
 */
export function SkeletonList({ rows = 5, label = fr.app.loading, flush = false }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`divide-y divide-line bg-surface ${flush ? '' : 'overflow-hidden rounded-card border border-line'}`}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
