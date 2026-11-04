import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { PasswordField } from '../../components/PasswordField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { useSubmit } from './useSubmit.js';

const t = fr.password;

export function PasswordChangeForm({ onDone }) {
  const { advance } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [mismatch, setMismatch] = useState(false);
  const { submit, submitting, error } = useSubmit(async ({ currentPassword, newPassword }) => {
    const result = await apiPost('/auth/password', { currentPassword, newPassword });
    await advance(result);
    return true;
  });

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    if (form.newPassword !== form.confirmation) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    if (await submit(form)) {
      setForm({ currentPassword: '', newPassword: '', confirmation: '' });
      onDone?.();
    }
  }

  const problems = error?.code === 'WEAK_PASSWORD' ? (error.details?.problems ?? []) : [];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && !problems.length && <Alert>{errorMessage(error)}</Alert>}
      <PasswordField
        label={t.current}
        name="current-password"
        autoComplete="current-password"
        required
        maxLength={128}
        value={form.currentPassword}
        onChange={update('currentPassword')}
      />
      <PasswordField
        label={t.new}
        hint={t.rules}
        name="new-password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={form.newPassword}
        onChange={update('newPassword')}
        error={problems.map((code) => t.problems[code]).join(' ') || undefined}
      />
      <PasswordField
        label={t.confirm}
        name="confirm-password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={form.confirmation}
        onChange={update('confirmation')}
        error={mismatch ? t.mismatch : undefined}
      />
      <Button
        type="submit"
        loading={submitting}
        disabled={!form.currentPassword || !form.newPassword || !form.confirmation}
      >
        {fr.common.save}
      </Button>
    </form>
  );
}
