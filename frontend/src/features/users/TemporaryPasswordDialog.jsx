import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { fr } from '../../i18n/fr.js';

/** Shows a temporary password exactly once. It is not kept anywhere in the browser. */
export function TemporaryPasswordDialog({ username, password, onClose }) {
  return (
    <Dialog
      title={fr.users.temporaryTitle}
      onClose={onClose}
      footer={<Button onClick={onClose}>{fr.users.temporaryDone}</Button>}
    >
      <p className="text-sm text-ink-soft">{fr.users.temporaryIntro}</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-ink-muted">{fr.users.username}</dt>
          <dd className="mt-0.5 font-mono text-base text-ink">{username}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{fr.login.password}</dt>
          <dd className="mt-1 select-all break-all rounded-control border border-primary/20 bg-primary-soft px-3 py-2 font-mono text-lg tracking-wider text-ink">
            {password}
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
