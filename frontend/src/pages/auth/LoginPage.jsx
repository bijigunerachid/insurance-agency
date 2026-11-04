import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { PasswordField } from '../../components/PasswordField.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useSubmit } from '../../features/auth/useSubmit.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

const t = fr.login;

export function LoginPage() {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Start every sign-in from the home page: the address may still point to a page the
  // previous user of this workstation could open but this user cannot.
  const { submit, submitting, error } = useSubmit(async (name, secret) => {
    navigate('/', { replace: true });
    await login(name, secret);
  });

  function onSubmit(event) {
    event.preventDefault();
    submit(username, password).then(() => setPassword(''));
  }

  return (
    <AuthLayout title={t.title} intro={t.intro}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {notice === 'SESSION_ENDED' && !error && <Alert tone="info">{t.sessionEnded}</Alert>}
        {notice === 'SIGNED_OUT' && !error && <Alert tone="info">{t.signedOut}</Alert>}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={t.username}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          required
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordField
          label={t.password}
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!username || !password}
        >
          {submitting ? t.submitting : t.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
