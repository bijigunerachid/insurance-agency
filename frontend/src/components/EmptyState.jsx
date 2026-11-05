import { InboxIcon } from '@heroicons/react/24/outline';

/**
 * Nothing to show: says so plainly, why if useful, and the next step when there is one (a real
 * action of the page, never an invented one). `compact`: one quiet line, for a part of a page
 * (a contract without attestations) rather than a whole list.
 */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  compact = false,
}) {
  if (compact) {
    return (
      <p className="rounded-card border border-dashed border-line-strong/50 bg-surface px-4 py-3 text-sm text-ink-muted">
        {title}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong/50 bg-surface px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-sunken">
        <Icon aria-hidden="true" className="size-5 text-ink-muted" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
