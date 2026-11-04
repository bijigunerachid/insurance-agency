import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate } from '../../utils/format.js';
import { useInsurerFilter } from '../workspace/Workspace.jsx';

const t = fr.home;
const SEARCH_DELAY_MS = 300;

/**
 * One search for everything (name, CIN, plate, policy or attestation number), shared by the home
 * page and the header's quick search: it waits until the person stops typing, and in one
 * insurer's workspace it finds that insurer's clients, vehicles and contracts (and those without
 * any contract).
 */
export function useGlobalSearch(text) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const params = useInsurerFilter().apply(new URLSearchParams({ q: query }));
  const results = useApiQuery(query.length >= 2 ? `/search?${params}` : null);
  return { query, results };
}

/** The results of `useGlobalSearch`, announced as they arrive; `onPick` runs when one is opened. */
export function SearchResults({ query, results, onPick }) {
  const data = results.state.status === 'done' && query.length >= 2 ? results.state.data : null;
  const count = data ? data.customers.length + data.vehicles.length + data.contracts.length : 0;
  const link = 'focus-ring block rounded-control px-2 py-2 hover:bg-canvas';
  return (
    <div aria-live="polite">
      {query.length >= 2 && results.state.status === 'loading' && <Spinner label={t.searching} />}
      {results.state.status === 'error' && <Alert>{errorMessage(results.state.error)}</Alert>}
      {data && count === 0 && <p className="text-sm text-ink-muted">{t.noResult}</p>}
      {data && count > 0 && (
        <div className="space-y-3">
          <ResultGroup title={t.results.customers} items={data.customers}>
            {(c) => (
              <Link to={`/clients/${c.id}`} onClick={onPick} className={link}>
                <span className="font-medium text-primary">{c.displayName}</span>{' '}
                <span className="text-xs text-ink-muted">
                  {c.ref}
                  {c.city && ` · ${c.city}`}
                </span>
              </Link>
            )}
          </ResultGroup>
          <ResultGroup title={t.results.vehicles} items={data.vehicles}>
            {(v) => (
              <Link to={`/vehicules/${v.id}`} onClick={onPick} className={link}>
                <span className="font-mono font-medium text-primary">{v.registration}</span>{' '}
                <span className="text-xs text-ink-muted">
                  {v.makeAndModel} · {v.owner}
                </span>
              </Link>
            )}
          </ResultGroup>
          <ResultGroup title={t.results.contracts} items={data.contracts}>
            {(c) => (
              <Link to={`/contrats/${c.id}`} onClick={onPick} className={link}>
                <span className="font-mono font-medium text-primary">{c.ref}</span>{' '}
                <span className="text-xs text-ink-muted">
                  {c.customer} · {c.insurer}
                  {c.policyNumber && ` · ${c.policyNumber}`} · {fr.contracts.statuses[c.status]} ·{' '}
                  {formatDate(c.endDate)}
                </span>
              </Link>
            )}
          </ResultGroup>
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, items, children }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <ul className="mt-1 divide-y divide-line text-sm">
        {items.map((item) => (
          <li key={item.id}>{children(item)}</li>
        ))}
      </ul>
    </div>
  );
}
