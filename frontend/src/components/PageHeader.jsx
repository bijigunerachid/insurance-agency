import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { Link } from 'react-router';

/** « ← Retour aux clients »: the way back to the list a page was opened from. */
export function BackLink({ to, children }) {
  return (
    <Link
      to={to}
      className="focus-ring inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}

/**
 * The top of every page: an optional way back, the title (the page's only h1), one line that
 * says what the page is for, and the page's main actions on the right (below on a phone).
 * `titleId` lets the page's <section aria-labelledby> point at the title.
 */
export function PageHeader({ title, titleId, description, actions, back, meta }) {
  return (
    <header className="space-y-3">
      {back && <BackLink to={back.to}>{back.label}</BackLink>}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 id={titleId} className="text-page text-ink">
            {title}
          </h1>
          {description && <p className="max-w-3xl text-sm text-ink-muted">{description}</p>}
          {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
