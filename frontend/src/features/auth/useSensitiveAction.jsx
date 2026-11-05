import { useCallback, useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField } from '../../components/TextField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, setCsrfToken } from '../../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { CodeField } from './CodeField.jsx';
import { useSubmit } from './useSubmit.js';

export const CANCELLED = 'CANCELLED';

/**
 * Runs an API call that may need a recent re-authentication. When the server answers
 * REAUTH_REQUIRED, asks for the password (and code), then retries the call once.
 * Render `dialog` somewhere in the page.
 */
export function useSensitiveAction() {
  const { me } = useAuth();
  const [pending, setPending] = useState(null);

  const run = useCallback(async (call) => {
    try {
      return await call();
    } catch (error) {
      if (error.code !== 'REAUTH_REQUIRED') throw error;
      await new Promise((resolve, reject) => setPending({ resolve, reject }));
      return call();
    }
  }, []);

  const dialog = pending && (
    <ReauthDialog
      needsCode={me.user.twoFactorEnabled}
      onDone={() => {
        pending.resolve();
        setPending(null);
      }}
      onCancel={() => {
        const error = new Error(CANCELLED);
        error.code = CANCELLED;
        pending.reject(error);
        setPending(null);
      }}
    />
  );

  return { run, dialog };
}

function ReauthDialog({ needsCode, onDone, onCancel }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { submit, submitting, error } = useSubmit(async () => {
    const result = await apiPost('/auth/reauth', needsCode ? { password, code } : { password });
    // The server issued a new session token: use its matching CSRF token from now on.
    setCsrfToken(result.csrfToken);
    onDone();
  });

  return (
    <Dialog title={fr.reauth.title} onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-ink-muted">{fr.reauth.intro}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={fr.login.password}
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {needsCode && <CodeField value={code} onChange={setCode} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {fr.common.cancel}
          </Button>
          <Button
            type="submit"
            disabled={submitting || !password || (needsCode && code.length !== 6)}
          >
            {fr.reauth.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
