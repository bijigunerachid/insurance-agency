import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { TextField } from '../../components/TextField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { CANCELLED } from '../auth/useSensitiveAction.jsx';
import { useSubmit } from '../auth/useSubmit.js';

const USERNAME = /^[a-z0-9._-]{3,64}$/;
const t = fr.users;

export function CreateUserDialog({ roles, run, onCreated, onClose }) {
  const [form, setForm] = useState({ username: '', displayName: '', roleCode: 'AGENT' });
  const [touched, setTouched] = useState(false);
  const { submit, submitting, error } = useSubmit(async () => {
    try {
      const result = await run(() => apiPost('/users', form));
      onCreated(result);
    } catch (err) {
      if (err.code !== CANCELLED) throw err;
    }
  });

  const usernameInvalid = touched && !USERNAME.test(form.username);
  const update = (field) => (event) =>
    setForm({
      ...form,
      [field]: field === 'username' ? event.target.value.toLowerCase() : event.target.value,
    });

  return (
    <Dialog title={t.create} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (USERNAME.test(form.username) && form.displayName.trim()) submit();
        }}
        className="space-y-4"
        noValidate
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={t.username}
          hint={t.usernameHint}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
          maxLength={64}
          required
          value={form.username}
          onChange={update('username')}
          error={usernameInvalid ? t.usernameHint : undefined}
        />
        <TextField
          label={t.displayName}
          maxLength={120}
          required
          value={form.displayName}
          onChange={update('displayName')}
          error={touched && !form.displayName.trim() ? fr.common.required : undefined}
        />
        <SelectField
          label={t.role}
          hint={t.twoFactorRoleNote}
          value={form.roleCode}
          onChange={update('roleCode')}
          options={roles.map((role) => ({ value: role.code, label: role.name }))}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={submitting}>
            {t.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
