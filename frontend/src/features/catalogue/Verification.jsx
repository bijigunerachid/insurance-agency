import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDay } from '../../utils/format.js';

const t = fr.verification;

/** "À confirmer" / "Confirmé", plus "Désactivé" when the entry is out of service. */
export function VerificationBadges({ entry }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge tone={entry.status === 'CONFIRMED' ? 'ok' : 'warning'}>
        {t[entry.status]}
      </StatusBadge>
      {!entry.active && <StatusBadge tone="neutral">{t.inactive}</StatusBadge>}
    </span>
  );
}

/** Source of the entry and, once confirmed, by whom, when and from which document. */
export function VerificationDetails({ entry }) {
  return (
    <div className="space-y-0.5 text-xs text-slate-600">
      <p>
        {t.source} : {entry.source}
      </p>
      {entry.confirmation && (
        <p>
          {t.confirmedBy(entry.confirmation.by.displayName, formatDay(entry.confirmation.at))} ·{' '}
          {entry.confirmation.reference}
        </p>
      )}
    </div>
  );
}

/** Asks for the document that confirms the entry; `onConfirm(reference)` saves it. */
export function ConfirmEntryDialog({ name, onConfirm, onClose }) {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const valid = reference.trim().length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reference.trim());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Dialog title={`${t.confirmTitle} : ${name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) submit();
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-slate-700">{t.confirmIntro}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={t.reference}
          hint={t.referenceHint}
          maxLength={200}
          required
          autoFocus
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {t.confirm}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
