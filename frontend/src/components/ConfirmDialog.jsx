import { fr } from '../i18n/fr.js';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';

/** Asks before a sensitive or irreversible action. */
export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel, tone }) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel ?? fr.common.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{message}</p>
    </Dialog>
  );
}
