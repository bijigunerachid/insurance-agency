import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { DetailItem, DetailList } from '../../components/DetailList.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink, PageHeader } from '../../components/PageHeader.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
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
const BACK = { to: '/utilisateurs', label: t.back };

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

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <BackLink to={BACK.to}>{BACK.label}</BackLink>
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      </div>
    );
  }

  const user = state.data;
  const isSelf = user.id === me.user.id;
  const canManage = can('users.manage');

  return (
    <div className="space-y-6">
      <PageHeader back={BACK} title={user.displayName} meta={<UserBadges user={user} />} />

      <Card>
        <DetailList>
          <DetailItem label={t.username} value={user.username} mono />
          <DetailItem label={t.role} value={user.role.name} />
          <DetailItem
            label={t.twoFactor}
            value={user.twoFactorEnabled ? fr.common.yes : fr.common.no}
          />
          <DetailItem label={t.activeSessions} value={user.activeSessions} />
          <DetailItem
            label={t.lastLogin}
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t.never}
          />
          <DetailItem label={t.createdAt} value={formatDateTime(user.createdAt)} />
        </DetailList>
      </Card>

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
  const available = Object.entries(ACTIONS).filter(([, action]) => action.when(user));

  return (
    <>
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}

      <Card title={t.edit}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const body = { version: user.version };
            if (form.displayName !== user.displayName) body.displayName = form.displayName.trim();
            if (form.roleCode !== user.role.code) body.roleCode = form.roleCode;
            perform(() => apiSend('PATCH', `/users/${user.id}`, body));
          }}
          className="grid max-w-2xl gap-4 sm:grid-cols-2"
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
            <Button
              type="submit"
              loading={busy && !confirming}
              disabled={busy || !dirty || !form.displayName.trim()}
            >
              {fr.common.save}
            </Button>
          </div>
        </form>
      </Card>

      {!isSelf && available.length > 0 && (
        <Card title={t.actions}>
          <ul className="divide-y divide-line">
            {available.map(([key]) => (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="min-w-0 flex-1 basis-64 text-sm text-ink-muted">
                  {t.actionConfirm[key]}
                </p>
                <Button variant="secondary" size="sm" onClick={() => setConfirming(key)}>
                  {t.actionLabels[key]}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
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
