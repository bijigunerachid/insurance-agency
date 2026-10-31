import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { DueBadge } from '../../features/renewals/RenewalList.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { formatDate, formatDateTime } from '../../utils/format.js';

const t = fr.renewals;
const FOLLOW_STEPS = ['TO_PREPARE', 'CUSTOMER_CONTACTED', 'DOCUMENTS_COMPLETE', 'NOT_RENEWED'];

export function RenewalDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { state, reload } = useApiQuery(`/renewals/${id}`);
  const [renewing, setRenewing] = useState(false);

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
  const renewal = state.data;
  const contract = renewal.contract;
  const editable = renewal.open && can('renewals.write');

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{contract.customer.displayName}</h1>
          <p className="text-sm text-slate-600">
            <Link to={`/contrats/${contract.id}`} className="font-mono text-blue-700 underline">
              {contract.ref}
            </Link>{' '}
            · {contract.insurer.code} · {contract.product.name}
          </p>
          <DueBadge renewal={renewal} />
        </div>
        {editable && <Button onClick={() => setRenewing(true)}>{t.renew}</Button>}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
          <Item label={t.dueDate} value={formatDate(renewal.dueDate)} />
          <Item label={t.statusLabel} value={t.statuses[renewal.status]} />
          <Item label={t.assignedUser} value={renewal.assignedUser.displayName} />
          <Item label={fr.contracts.fields.policyNumber} value={contract.policyNumber} />
          {/* Only for tacit renewal with a notice period (rule L11). */}
          {renewal.noticeDeadline && (
            <Item label={t.noticeDeadline} value={formatDate(renewal.noticeDeadline)} />
          )}
          {renewal.outcomeReason && <Item label={t.outcomeReason} value={renewal.outcomeReason} />}
          {renewal.renewedContract && (
            <Item
              label={t.renewed}
              value={
                <Link
                  to={`/contrats/${renewal.renewedContract.id}`}
                  className="font-mono text-blue-700 underline"
                >
                  {renewal.renewedContract.ref}
                </Link>
              }
            />
          )}
        </dl>
      </section>

      {editable && <FollowForm renewal={renewal} onDone={() => reload({ silent: true })} />}
      {renewal.open && can('renewals.assign') && (
        <AssignForm renewal={renewal} onDone={() => reload({ silent: true })} />
      )}

      <section aria-labelledby="renewal-history" className="space-y-3">
        <h2 id="renewal-history" className="text-lg font-semibold">
          {t.history}
        </h2>
        <ol className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {renewal.events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{t.event(e, t.statuses)}</span>{' '}
              <span className="text-slate-600">
                {e.by ? e.by.displayName : t.system}, {formatDateTime(e.at)}
              </span>
              {e.note && <span className="block text-slate-700">{e.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      {renewing && (
        <RenewDialog
          renewal={renewal}
          onClose={() => setRenewing(false)}
          onDone={(contractId) => navigate(`/contrats/${contractId}`)}
        />
      )}
    </div>
  );
}

function FollowForm({ renewal, onDone }) {
  const [status, setStatus] = useState(renewal.status);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const refusing = status === 'NOT_RENEWED';
  const valid = text.trim() || (!refusing && status !== renewal.status);

  async function submit(event) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body = { version: renewal.version };
      if (status !== renewal.status) body.status = status;
      if (text.trim()) body[refusing ? 'outcomeReason' : 'note'] = text.trim();
      await apiSend('PATCH', `/renewals/${renewal.id}`, body);
      setText('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
      noValidate
    >
      <h2 className="font-semibold sm:col-span-2">{t.follow}</h2>
      {error && (
        <div className="sm:col-span-2">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      )}
      <SelectField
        label={t.newStatus}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={FOLLOW_STEPS.map((value) => ({ value, label: t.statuses[value] }))}
      />
      <TextField
        label={refusing ? `${t.outcomeReason} *` : t.note}
        hint={refusing ? undefined : t.noteHint}
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sm:col-span-2">
        <Button type="submit" variant={refusing ? 'danger' : 'primary'} disabled={busy || !valid}>
          {t.follow}
        </Button>
      </div>
    </form>
  );
}

function AssignForm({ renewal, onDone }) {
  const users = useApiQuery('/renewals/assignees');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (users.state.status !== 'done') return null;
  const others = users.state.data.items.filter((u) => u.id !== renewal.assignedUser.id);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/renewals/${renewal.id}/assign`, {
        assignedUserId: userId,
        version: renewal.version,
      });
      setUserId('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      {error && <Alert>{errorMessage(error)}</Alert>}
      <SelectField
        label={t.assign}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        options={[
          { value: '', label: '—' },
          ...others.map((u) => ({ value: u.id, label: u.displayName })),
        ]}
      />
      <Button type="submit" variant="secondary" disabled={busy || !userId}>
        {t.assignButton}
      </Button>
    </form>
  );
}

/** Dates default to the same length of cover, starting the day after the old contract. */
function RenewDialog({ renewal, onClose, onDone }) {
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { version: renewal.version };
      if (dates.startDate) body.startDate = dates.startDate;
      if (dates.endDate) body.endDate = dates.endDate;
      const result = await apiPost(`/renewals/${renewal.id}/renew`, body);
      onDone(result.contractId);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Dialog title={t.renewTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-700">{t.renewIntro}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t.startDate}
            type="date"
            value={dates.startDate}
            onChange={(e) => setDates({ ...dates, startDate: e.target.value })}
          />
          <TextField
            label={t.endDate}
            type="date"
            value={dates.endDate}
            onChange={(e) => setDates({ ...dates, endDate: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {t.renew}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Item({ label, value }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-0.5 font-medium">
        {value === null || value === undefined || value === '' ? fr.vehicles.notSpecified : value}
      </dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/renouvellements"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
