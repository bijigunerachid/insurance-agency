import { useCallback, useState } from 'react';
import { Alert } from '../components/Alert.jsx';
import { Button } from '../components/Button.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { PasswordChangeForm } from '../features/auth/PasswordChangeForm.jsx';
import { TotpEnrollment } from '../features/auth/TotpEnrollment.jsx';
import { fr } from '../i18n/fr.js';

const t = fr.account;

export function AccountPage() {
  const { me } = useAuth();
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const stopEnrolling = useCallback(() => setEnrolling(false), []);
  const { user } = me;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>

      <section aria-labelledby="identity" className="rounded-lg border border-slate-200 bg-white">
        <h2 id="identity" className="border-b border-slate-200 px-4 py-3 font-semibold">
          {t.identity}
        </h2>
        <dl className="divide-y divide-slate-200 text-sm">
          <Row label={t.username} value={user.username} />
          <Row label={t.role} value={user.role.name} />
          <Row
            label={t.twoFactor}
            value={
              <StatusBadge tone={user.twoFactorEnabled ? 'ok' : 'error'}>
                {user.twoFactorEnabled ? fr.totp.enabled : fr.totp.disabled}
              </StatusBadge>
            }
          />
        </dl>
        {!user.twoFactorEnabled && (
          <div className="border-t border-slate-200 p-4">
            {enrolling ? (
              <div className="max-w-sm space-y-3">
                <p className="text-sm text-slate-600">{fr.totp.enrollOptionalIntro}</p>
                <TotpEnrollment onCancel={stopEnrolling} />
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setEnrolling(true)}>
                {fr.totp.start}
              </Button>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="change-password"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="change-password" className="mb-4 font-semibold">
          {t.changePassword}
        </h2>
        <div className="max-w-sm space-y-4">
          {passwordChanged && <Alert tone="info">{fr.password.changed}</Alert>}
          <PasswordChangeForm onDone={() => setPasswordChanged(true)} />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
