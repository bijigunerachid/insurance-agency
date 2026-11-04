/**
 * The top of a part of a page that holds its own list (a client's contracts, vehicles): an h2
 * with `id` for the section's aria-labelledby, and the part's action on the right.
 */
export function SectionHeading({ id, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-section text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
