import { Link } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { fr } from '../../i18n/fr.js';

const t = fr.customers;

/**
 * Shows possible duplicates. A "suspected" duplicate (same phone or name) can be overridden;
 * a "hard" one (same identity number or ICE) cannot: open the existing customer instead.
 */
export function DuplicateDialog({ candidates, hard, busy, onConfirm, onCancel }) {
  return (
    <Dialog
      title={t.duplicateTitle}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {fr.common.cancel}
          </Button>
          {!hard && (
            <Button onClick={onConfirm} disabled={busy}>
              {t.notDuplicate}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-slate-700">{hard ? t.duplicateHardIntro : t.duplicateIntro}</p>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
        {candidates.map((candidate) => (
          <li
            key={`${candidate.id}-${candidate.matchedOn}`}
            className="flex flex-wrap justify-between gap-2 px-3 py-2"
          >
            <Link
              to={`/clients/${candidate.id}`}
              target="_blank"
              rel="noopener"
              className="font-medium text-blue-700 underline"
            >
              {candidate.displayName}
            </Link>
            <span className="text-slate-600">
              {candidate.ref} · {t.matchedOn[candidate.matchedOn]}
              {candidate.archived ? ` · ${t.archived}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
