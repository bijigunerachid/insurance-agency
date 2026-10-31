import { useState } from 'react';
import { errorMessage, fr } from '../i18n/fr.js';
import { Alert } from './Alert.jsx';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';
import { TextField } from './TextField.jsx';

const MIN = 5;

/** Asks for a short written reason (5 to 200 characters) before an audited action. */
export function ReasonDialog({ title, intro, confirmLabel, busy, error, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= MIN;
  return (
    <Dialog title={title} onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onConfirm(reason.trim());
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-slate-700">{intro}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={fr.customers.reason}
          hint={`${MIN} caractères minimum.`}
          maxLength={200}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
