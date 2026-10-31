import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CANCELLED, useSensitiveAction } from '../../features/auth/useSensitiveAction.jsx';
import { TemporaryPasswordDialog } from '../../features/users/TemporaryPasswordDialog.jsx';
import { UserBadges } from '../../features/users/UserBadges.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.users;

const ACTIONS = {
  disable: { path: 'disable', tone: 'danger', when: (u) => u.active },
  enable: { path: 'enable', when: (u) => !u.active },
  unlock: { path: 'unlock', when: (u) => u.locked },
  resetPassword: { path: 'reset-password', tone: 'danger', when: () => true },
  resetTwoFactor: { path: 'reset-two-factor', tone: 'danger', when: (u) => u.twoFactorEnabled },
  endSessions: { path: 'end-sessions', when: (u) => u.activeSessions > 0 },
};

export function UserDetailPage() {
  const { id } = useParams();
  const { me, can } = useAuth();
  const { state, reload } = useApiQuery(`/users/${id}`);
  const roles = useApiQuery('/roles');

  if (state.status === 'loading') return <Spinner label={fr.app.loading} />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink />}
      />
    );
  }

  const user = state.data;
  const isSelf = user.id === me.user.id;
  const canManage = can('users.manage');

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{user.displayName}</h1>
        <UserBadges user={user} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
          <Item label={t.username} value={<span className="font-mono">{user.username}</span>} />
          <Item label={t.role} value={user.role.name} />
          <Item label={t.twoFactor} value={user.twoFactorEnabled ? fr.common.yes : fr.common.no} />
          <Item label={t.activeSessions} value={user.activeSessions} />
          <Item
            label={t.lastLogin}
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t.never}
          />
          <Item label={t.createdAt} value={formatDateTime(user.createdAt)} />
        </dl>
      </section>

      {canManage && roles.state.status === 'done' && (
        <ManagePanels user={user} isSelf={isSelf} roles={roles.state.data.items} reload={reload} />
      )}
    </div>
  );
}

function ManagePanels({ user, isSelf, roles, reload }) {
  const { run, dialog } = useSensitiveAction();
  const [form, setForm] = useState({ displayName: user.displayName, roleCode: user.role.code });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [temporary, setTemporary] = useState(null);

  async function perform(call, onSuccess) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await run(call);
      onSuccess?.(result);
      setMessage(t.saved);
      reload({ silent: true });
    } catch (err) {
      if (err.code !== CANCELLED) setError(err);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const dirty = form.displayName !== user.displayName || form.roleCode !== user.role.code;

  return (
    <>
      {message && <Alert tone="info">{message}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}

      <section
        aria-labelledby="edit-title"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="edit-title" className="mb-4 font-semibold">
          {t.edit}
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const body = { version: user.version };
            if (form.displayName !== user.displayName) body.displayName = form.displayName.trim();
            if (form.roleCode !== user.role.code) body.roleCode = form.roleCode;
            perform(() => apiSend('PATCH', `/users/${user.id}`, body));
          }}
          className="grid max-w-xl gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            label={t.displayName}
            maxLength={120}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <SelectField
            label={t.role}
            hint={isSelf ? fr.errors.SELF_ACTION : t.twoFactorRoleNote}
            disabled={isSelf}
            value={form.roleCode}
            onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
            options={roles.map((role) => ({ value: role.code, label: role.name }))}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !dirty || !form.displayName.trim()}>
              {fr.common.save}
            </Button>
          </div>
        </form>
      </section>

      {!isSelf && (
        <section
          aria-labelledby="actions-title"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <h2 id="actions-title" className="mb-4 font-semibold">
            {t.actions}
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ACTIONS)
              .filter(([, action]) => action.when(user))
              .map(([key]) => (
                <Button key={key} variant="secondary" onClick={() => setConfirming(key)}>
                  {t.actionLabels[key]}
                </Button>
              ))}
          </div>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          title={t.actionLabels[confirming]}
          message={t.actionConfirm[confirming]}
          confirmLabel={t.actionLabels[confirming]}
          tone={ACTIONS[confirming].tone}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            perform(
              () =>
                apiPost(
                  `/users/${user.id}/${ACTIONS[confirming].path}`,
                  confirming === 'endSessions' ? {} : { version: user.version },
                ),
              (result) => {
                if (result?.temporaryPassword) {
                  setTemporary({ username: user.username, password: result.temporaryPassword });
                }
              },
            )
          }
        />
      )}
      {temporary && (
        <TemporaryPasswordDialog
          username={temporary.username}
          password={temporary.password}
          onClose={() => setTemporary(null)}
        />
      )}
      {dialog}
    </>
  );
}

function Item({ label, value }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/utilisateurs"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
