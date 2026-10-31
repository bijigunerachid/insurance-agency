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
      <p className="text-sm text-slate-700">{fr.users.temporaryIntro}</p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-slate-600">{fr.users.username}</dt>
          <dd className="font-mono text-base">{username}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{fr.login.password}</dt>
          <dd className="select-all rounded bg-slate-100 px-2 py-1 font-mono text-lg tracking-wider">
            {password}
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
