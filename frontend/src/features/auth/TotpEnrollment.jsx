import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { CodeField } from './CodeField.jsx';
import { CANCELLED, useSensitiveAction } from './useSensitiveAction.jsx';
import { useSubmit } from './useSubmit.js';

/**
 * Starts enrolment (server creates the secret), shows it as a QR code generated locally
 * (no external service), then confirms with a first code. From a signed-in session the server
 * asks to confirm identity first; `onCancel` is called if the user declines.
 */
export function TotpEnrollment({ onCancel }) {
  const { advance } = useAuth();
  const { run, dialog } = useSensitiveAction();
  const [setup, setSetup] = useState({ status: 'loading' });
  const [code, setCode] = useState('');
  const { submit, submitting, error } = useSubmit(async (value) => {
    try {
      await advance(await run(() => apiPost('/auth/totp/enroll/confirm', { code: value })));
    } catch (err) {
      if (err.code !== CANCELLED) throw err;
    }
  });

  useEffect(() => {
    let cancelled = false;
    run(() => apiPost('/auth/totp/enroll/start'))
      .then(async ({ secret, otpauthUri }) => {
        const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 200 });
        if (!cancelled) setSetup({ status: 'ready', secret, qr });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === CANCELLED) onCancel?.();
        else setSetup({ status: 'error', error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [run, onCancel]);

  if (setup.status !== 'ready') {
    return (
      <>
        {setup.status === 'loading' ? (
          <Spinner label={fr.app.loading} />
        ) : (
          <Alert>{errorMessage(setup.error)}</Alert>
        )}
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <img
        src={setup.qr}
        alt={fr.totp.qrAlt}
        width={200}
        height={200}
        className="mx-auto rounded-card border border-line bg-white p-2"
      />
      <div className="text-sm">
        <p className="text-ink-muted">{fr.totp.manualKey}</p>
        <p className="mt-1 break-all rounded-control bg-sunken px-2.5 py-1.5 font-mono tracking-wider text-ink">
          {setup.secret.match(/.{1,4}/g).join(' ')}
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(code).then(() => setCode(''));
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm font-medium text-ink-soft">{fr.totp.enrollConfirm}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <CodeField value={code} onChange={setCode} />
        <Button type="submit" loading={submitting} disabled={code.length !== 6}>
          {fr.totp.activate}
        </Button>
      </form>
      {dialog}
    </div>
  );
}
