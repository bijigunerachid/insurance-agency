import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CodeField } from '../../features/auth/CodeField.jsx';
import { useSubmit } from '../../features/auth/useSubmit.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { apiPost } from '../../services/api.js';

export function TotpVerifyPage() {
  const { advance, logout } = useAuth();
  const [code, setCode] = useState('');
  const { submit, submitting, error } = useSubmit(async (value) =>
    advance(await apiPost('/auth/totp/verify', { code: value })),
  );

  function onSubmit(event) {
    event.preventDefault();
    submit(code).then(() => setCode(''));
  }

  return (
    <AuthLayout
      title={fr.totp.verifyTitle}
      intro={fr.totp.verifyIntro}
      footer={<SignOutLink onClick={logout} />}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <CodeField value={code} onChange={setCode} autoFocus />
        <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
          {fr.totp.verify}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function SignOutLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-blue-700 underline hover:text-blue-900"
    >
      {fr.nav.logout}
    </button>
  );
}
