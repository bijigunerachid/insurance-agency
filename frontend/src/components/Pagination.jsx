import { fr } from '../i18n/fr.js';
import { Button } from './Button.jsx';

export function Pagination({ page, pageCount, total, onPage }) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"
    >
      <p>{fr.common.results(total)}</p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {fr.common.previous}
        </Button>
        <span aria-current="page">{fr.common.pageOf(page, pageCount)}</span>
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          {fr.common.next}
        </Button>
      </div>
    </nav>
  );
}
