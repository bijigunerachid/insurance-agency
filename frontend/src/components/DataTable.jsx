import { useWideScreen } from '../hooks/useWideScreen.js';

const align = (column) => (column.align === 'right' ? 'text-right' : 'text-left');

/**
 * A list of records: a table on a computer, one card per record on a phone (no sideways
 * scrolling). `columns` = [{ key, header, cell(row), align?, primary?, hideOnPhone? }]: the
 * `primary` column heads each card (usually a link to the record); the others are shown under
 * it as label and value. Sorting, filters and pagination stay with the page and its API: this
 * component only shows the rows it is given. `renderCard(row)` replaces the phone card when a list
 * needs its own (a client's card calls them).
 */
export function DataTable({ columns, rows, rowKey = (row) => row.id, caption, renderCard }) {
  const wide = useWideScreen();
  if (!wide) {
    const primary = columns.find((column) => column.primary) ?? columns[0];
    const details = columns.filter((column) => column !== primary && !column.hideOnPhone);
    return (
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
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-hairline">
      <table className="min-w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line bg-canvas/70">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted ${align(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-canvas/60">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle text-ink ${align(column)} ${column.className ?? ''}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
