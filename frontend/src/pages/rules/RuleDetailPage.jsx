import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { EntryFormDialog, changesOf } from '../../features/catalogue/EntryFormDialog.jsx';
import { RuleStatusBadge } from '../../features/rules/RuleStatusBadge.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { formatDateTime, formatDay } from '../../utils/format.js';

const t = fr.rules;

export function RuleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/rules/${id}`);
  const [editing, setEditing] = useState(false);

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
  const rule = state.data;
  const canManage = can('catalogue.manage');
  const initial = { statement: rule.statement, effect: rule.effect, source: rule.source };

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">
            <span className="font-mono">{rule.code}</span>{' '}
            <span className="text-base font-normal text-slate-600">
              · {rule.insurer ? rule.insurer.code : t.general}
            </span>
          </h1>
          <RuleStatusBadge status={rule.status} />
          <p className="text-xs text-slate-600">{t.statusHelp[rule.status]}</p>
        </div>
        {canManage && rule.status !== 'CONFIRMED' && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {fr.catalogue.edit}
          </Button>
        )}
      </div>
      {canManage && rule.status === 'CONFIRMED' && <Alert tone="info">{t.confirmedLocked}</Alert>}

      <section className="rounded-lg border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200 text-sm">
          <Item label={t.statement} value={rule.statement} />
          <Item label={t.effect} value={rule.effect} />
          <Item label={t.source} value={rule.source} />
          {rule.reviewedBy && (
            <Item
              label={t.lastReview}
              value={t.reviewedBy(rule.reviewedBy.displayName, formatDay(rule.reviewedAt))}
            />
          )}
        </dl>
      </section>

      {canManage && <ReviewForm rule={rule} onDone={() => reload({ silent: true })} />}

      <section
        aria-labelledby="history-title"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <h2 id="history-title" className="border-b border-slate-200 px-4 py-3 font-semibold">
          {t.history}
        </h2>
        {rule.reviews.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">{t.noHistory}</p>
        ) : (
          <ol className="divide-y divide-slate-200">
            {rule.reviews.map((review) => (
              <li key={review.id} className="space-y-1 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <RuleStatusBadge status={review.fromStatus} />
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">vers</span>
                  <RuleStatusBadge status={review.toStatus} />
                </p>
                <p>{review.note}</p>
                {review.reference && (
                  <p className="text-slate-600">
                    {t.reference} : {review.reference}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {review.reviewer.displayName} · {formatDateTime(review.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {editing && (
        <EntryFormDialog
          title={t.editTitle}
          fields={[
            {
              name: 'statement',
              label: t.statement,
              type: 'textarea',
              required: true,
              maxLength: 1000,
            },
            { name: 'effect', label: t.effect, type: 'textarea', required: true, maxLength: 1000 },
            { name: 'source', label: t.source, required: true, maxLength: 400 },
          ]}
          initial={initial}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await apiSend('PATCH', `/rules/${rule.id}`, changesOf(values, initial, rule.version));
            setEditing(false);
            reload({ silent: true });
          }}
        />
      )}
    </div>
  );
}

/** Records a review: new status, what was checked and, for "Confirmée", the document. */
function ReviewForm({ rule, onDone }) {
  const empty = { status: rule.status, note: '', reference: '' };
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const needsReference = form.status === 'CONFIRMED';
  const missingNote = !form.note.trim();
  const missingReference = needsReference && !form.reference.trim();
  const set = (name) => (event) => {
    setSaved(false);
    setForm({ ...form, [name]: event.target.value });
  };

  async function submit() {
    setTouched(true);
    if (missingNote || missingReference) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/rules/${rule.id}/review`, {
        status: form.status,
        note: form.note.trim(),
        ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
        version: rule.version,
      });
      setForm({ ...empty, status: form.status });
      setTouched(false);
      setSaved(true);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="review-title" className="rounded-lg border border-slate-200 bg-white">
      <h2 id="review-title" className="border-b border-slate-200 px-4 py-3 font-semibold">
        {t.review}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="grid gap-4 p-4 sm:grid-cols-2"
        noValidate
      >
        <p className="text-sm text-slate-600 sm:col-span-2">{t.reviewIntro}</p>
        {error && (
          <div className="sm:col-span-2">
            <Alert>{errorMessage(error)}</Alert>
          </div>
        )}
        {saved && (
          <div className="sm:col-span-2">
            <Alert tone="info">{fr.common.saved}</Alert>
          </div>
        )}
        <SelectField
          label={t.newStatus}
          value={form.status}
          onChange={set('status')}
          hint={t.statusHelp[form.status]}
          options={Object.entries(t.statuses).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          label={t.note}
          hint={t.noteHint}
          maxLength={500}
          required
          value={form.note}
          onChange={set('note')}
          error={touched && missingNote ? fr.common.required : undefined}
        />
        <TextField
          className="sm:col-span-2"
          label={needsReference ? `${t.reference} *` : t.reference}
          hint={t.referenceHint}
          maxLength={200}
          required={needsReference}
          value={form.reference}
          onChange={set('reference')}
          error={touched && missingReference ? fr.common.required : undefined}
        />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {t.review}
          </Button>
        </div>
      </form>
    </section>
  );
}

function Item({ label, value }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/regles"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
