import { useCallback, useState } from 'react';
import { Alert } from '../components/Alert.jsx';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
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
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.title} description={user.displayName} />

      <Card title={t.identity} flush>
        <dl className="divide-y divide-line text-sm">
          <Row label={t.username} value={<span className="font-mono">{user.username}</span>} />
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
          <div className="border-t border-line p-4 sm:px-5">
            {enrolling ? (
              <div className="max-w-sm space-y-3">
                <p className="text-sm text-ink-muted">{fr.totp.enrollOptionalIntro}</p>
                <TotpEnrollment onCancel={stopEnrolling} />
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setEnrolling(true)}>
                {fr.totp.start}
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card title={t.changePassword}>
        <div className="max-w-sm space-y-4">
          {passwordChanged && <Alert tone="success">{fr.password.changed}</Alert>}
          <PasswordChangeForm onDone={() => setPasswordChanged(true)} />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
