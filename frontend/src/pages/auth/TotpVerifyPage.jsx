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
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={code.length !== 6}
        >
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
      className="focus-ring rounded-control font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
    >
      {fr.nav.logout}
    </button>
  );
}
