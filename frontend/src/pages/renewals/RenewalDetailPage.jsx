import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { DetailItem, DetailList } from '../../components/DetailList.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink, PageHeader } from '../../components/PageHeader.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { usePageTitle } from '../../features/layout/PageTitle.jsx';
import { DueBadge } from '../../features/renewals/RenewalList.jsx';
import { RenewalSteps } from '../../features/renewals/RenewalSteps.jsx';
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
  // The header shows « … › {the client} » once loaded.
  usePageTitle(state.status === 'done' ? state.data.contract.customer.displayName : null);
  const [renewing, setRenewing] = useState(false);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink to="/renouvellements">{t.back}</BackLink>}
      />
    );
  }
  const renewal = state.data;
  const contract = renewal.contract;
  const editable = renewal.open && can('renewals.write');

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/renouvellements', label: t.back }}
        title={contract.customer.displayName}
        description={
          <>
            <TextLink to={`/contrats/${contract.id}`} className="font-mono">
              {contract.ref}
            </TextLink>{' '}
            · {contract.insurer.code} · {contract.product.name}
          </>
        }
        meta={<DueBadge renewal={renewal} />}
        actions={editable && <Button onClick={() => setRenewing(true)}>{t.renew}</Button>}
      />

      <RenewalSteps status={renewal.status} />

      <Card title={t.facts}>
        <DetailList>
          <Fact label={t.dueDate} value={formatDate(renewal.dueDate)} />
          <Fact label={t.statusLabel} value={t.statuses[renewal.status]} />
          <Fact label={t.assignedUser} value={renewal.assignedUser.displayName} />
          <Fact label={fr.contracts.fields.policyNumber} value={contract.policyNumber} mono />
          {/* Only for tacit renewal with a notice period (rule L11). */}
          {renewal.noticeDeadline && (
            <Fact label={t.noticeDeadline} value={formatDate(renewal.noticeDeadline)} />
          )}
          {renewal.outcomeReason && <Fact label={t.outcomeReason} value={renewal.outcomeReason} />}
          {renewal.renewedContract && (
            <Fact
              label={t.renewed}
              value={
                <TextLink to={`/contrats/${renewal.renewedContract.id}`} className="font-mono">
                  {renewal.renewedContract.ref}
                </TextLink>
              }
            />
          )}
        </DetailList>
      </Card>

      {editable && <FollowForm renewal={renewal} onDone={() => reload({ silent: true })} />}
      {renewal.open && can('renewals.assign') && (
        <AssignForm renewal={renewal} onDone={() => reload({ silent: true })} />
      )}

      <Card title={t.history}>
        <ol className="space-y-3 text-sm">
          {renewal.events.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-3">
              <span className="font-medium text-ink">{t.event(e, t.statuses)}</span>{' '}
              <span className="text-ink-muted">
                {e.by ? e.by.displayName : t.system}, {formatDateTime(e.at)}
              </span>
              {e.note && <span className="block text-ink-soft">{e.note}</span>}
            </li>
          ))}
        </ol>
      </Card>

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
    <Card title={t.follow}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
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
          <Button
            type="submit"
            variant={refusing ? 'danger' : 'primary'}
            loading={busy}
            disabled={!valid}
          >
            {t.follow}
          </Button>
        </div>
      </form>
    </Card>
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
      className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5"
    >
      {error && (
        <div className="w-full">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      )}
      <SelectField
        className="min-w-56"
        label={t.assign}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        options={[
          { value: '', label: '—' },
          ...others.map((u) => ({ value: u.id, label: u.displayName })),
        ]}
      />
      <Button type="submit" variant="secondary" loading={busy} disabled={!userId}>
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
        <p className="text-sm text-ink-soft">{t.renewIntro}</p>
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
          <Button type="submit" loading={busy}>
            {t.renew}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A fact of the renewal; empty reads « Non précisé ». */
function Fact(props) {
  return <DetailItem empty={fr.vehicles.notSpecified} {...props} />;
}
