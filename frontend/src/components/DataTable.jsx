import { useWideScreen } from '../hooks/useWideScreen.js';

const align = (column) => (column.align === 'right' ? 'text-right' : 'text-left');
/** Kept in view, on its own background with a line at its right, as a wide table scrolls. */
const STICKY = 'sticky left-0 z-10 bg-inherit shadow-[1px_0_0_var(--color-line)]';

/**
 * A list of records: a table on a computer, one card per record on a phone (no sideways
 * scrolling). `columns` = [{ key, header, cell(row), align?, primary?, hideOnPhone? }]: the
 * `primary` column heads each card (usually a link to the record); the others are shown under
 * it as label and value. Sorting, filters and pagination stay with the page and its API: this
 * component only shows the rows it is given. `renderCard(row)` replaces the phone card when a list
 * needs its own (a client's card calls them).
 * `footer` = { label, cells: { [key]: node } }: a totals line (the last row of the table; its own
 * card under the list on a phone). `stickyFirst` keeps the first column in view when a wide
 * table scrolls inside its box (a report with a dozen columns).
 */
export function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  caption,
  renderCard,
  footer,
  stickyFirst = false,
}) {
  const wide = useWideScreen();
  const sticky = (index) => (stickyFirst && index === 0 ? STICKY : '');
  if (!wide) {
    const primary = columns.find((column) => column.primary) ?? columns[0];
    const details = columns.filter((column) => column !== primary && !column.hideOnPhone);
    const list = (
      <ul aria-label={caption} className="space-y-2">
        {rows.map((row) =>
          renderCard ? (
            <li key={rowKey(row)}>{renderCard(row)}</li>
          ) : (
            <li
              key={rowKey(row)}
              className="rounded-card border border-line bg-surface p-4 shadow-hairline"
            >
              <div className="font-medium text-ink">{primary.cell(row)}</div>
              {details.length > 0 && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {details.map((column) => (
                    <div key={column.key} className="contents">
                      <dt className="text-ink-muted">{column.header}</dt>
                      <dd className="min-w-0 text-right text-ink tabular-nums">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ),
        )}
      </ul>
    );
    if (!footer) return list;
    const totals = columns.filter((column) => footer.cells[column.key] !== undefined);
    return (
      <div className="space-y-2">
        {list}
        <section
          aria-label={footer.label}
          className="rounded-card border border-line-strong/40 bg-sunken p-4"
        >
          <h3 className="font-semibold text-ink">{footer.label}</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {totals.map((column) => (
              <div key={column.key} className="contents">
                <dt className="text-ink-muted">{column.header}</dt>
                <dd className="min-w-0 text-right font-semibold text-ink tabular-nums">
                  {footer.cells[column.key]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-hairline">
      <table className="min-w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line">
          <tr className="bg-canvas">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted ${align(column)} ${sticky(index)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="bg-surface transition-colors hover:bg-canvas">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle text-ink ${align(column)} ${column.className ?? ''} ${sticky(index)}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t border-line-strong/40">
            <tr className="bg-sunken font-semibold">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 text-ink ${align(column)} ${column.className ?? ''} ${sticky(index)}`}
                >
                  {footer.cells[column.key] ?? (index === 0 ? footer.label : '')}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
