import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextLink } from '../../components/TextLink.jsx';
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
            <Button onClick={onConfirm} loading={busy}>
              {t.notDuplicate}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-ink-soft">{hard ? t.duplicateHardIntro : t.duplicateIntro}</p>
      <ul className="divide-y divide-line rounded-control border border-line text-sm">
        {candidates.map((candidate) => (
          <li
            key={`${candidate.id}-${candidate.matchedOn}`}
            className="flex flex-wrap justify-between gap-2 px-3 py-2.5"
          >
            <TextLink to={`/clients/${candidate.id}`} target="_blank" rel="noopener">
              {candidate.displayName}
            </TextLink>
            <span className="text-ink-muted">
              {candidate.ref} · {t.matchedOn[candidate.matchedOn]}
              {candidate.archived ? ` · ${t.archived}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
