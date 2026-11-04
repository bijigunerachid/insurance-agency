import { useId } from 'react';

/**
 * A white block of the page. With a `title`, it is a named region (an h2) with optional actions
 * on the right; `flush` leaves out the inner padding (a table or a list that reaches the edges).
 */
export function Card({ title, description, actions, flush = false, className = '', children }) {
  const titleId = useId();
  const Tag = title ? 'section' : 'div';
  return (
    <Tag
      aria-labelledby={title ? titleId : undefined}
      className={`overflow-hidden rounded-card border border-line bg-surface shadow-hairline ${className}`}
    >
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-section text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </Tag>
  );
}
