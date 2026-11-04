import { fr } from '../i18n/fr.js';

/** Facts about a record, label above value, in two columns from a small tablet. */
export function DetailList({ children }) {
  return <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">{children}</dl>;
}

/** One fact; an empty value shows `empty` (« — » by default), never a blank. */
export function DetailItem({ label, value, mono = false, empty = fr.common.none }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`mt-0.5 break-words font-medium ${missing ? 'text-ink-muted' : 'text-ink'} ${mono && !missing ? 'font-mono' : ''}`}
      >
        {missing ? empty : value}
      </dd>
    </div>
  );
}
