import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.stock;
const seriesLabel = (s) => `${s.insurer.code} ${s.code} · ${s.model.label}`;

/** Sends `body` to `path`; shows field errors and the numbers that block a range. */
function useRangeSubmit(path, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  async function submit(body) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      onDone(await apiPost(path, body));
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
      }
      setBusy(false);
    }
  }
  const clear = (name) => setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  return { busy, error, fieldErrors, submit, clear };
}

function RangeError({ error }) {
  if (!error) return null;
  return (
    <Alert>
      {errorMessage(error)}
      {error.details?.numbers && (
        <span className="block">{t.numbersBlocked(error.details.numbers)}</span>
      )}
    </Alert>
  );
}

function HolderSelect({ value, onChange, error, hint }) {
  const holders = useApiQuery('/attestation-stock/holders');
  if (holders.state.status !== 'done') return <Spinner label={fr.app.loading} />;
  return (
    <SelectField
      label={t.fields.holderId}
      hint={hint}
      value={value}
      onChange={onChange}
      error={error}
      options={[
        { value: '', label: '—' },
        ...holders.state.data.items.map((u) => ({ value: u.id, label: u.displayName })),
      ]}
    />
  );
}

/** A delivery of blank forms: a series and a range of serial numbers. */
export function ReceiveDialog({ onDone, onClose }) {
  const seriesQuery = useApiQuery('/attestation-series');
  const series =
    seriesQuery.state.status === 'done'
      ? seriesQuery.state.data.items.filter((s) => s.status === 'CONFIRMED' && s.active)
      : [];
  const [values, setValues] = useState({
    seriesId: '',
    firstNumber: '',
    lastNumber: '',
    receivedOn: '',
    insurerReference: '',
    location: '',
    holderId: '',
  });
  const { busy, error, fieldErrors, submit, clear } = useRangeSubmit(
    '/attestation-batches',
    onDone,
  );
  const set = (name) => (event) => {
    setValues({ ...values, [name]: event.target.value });
    clear(name);
  };
  const complete = [
    'seriesId',
    'firstNumber',
    'lastNumber',
    'receivedOn',
    'location',
    'holderId',
  ].every((name) => values[name].trim());

  return (
    <Dialog title={t.receive} onClose={onClose}>
      {seriesQuery.state.status !== 'done' ? (
        <Spinner label={fr.app.loading} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (complete) submit(values);
          }}
          className="space-y-4"
          noValidate
        >
          <RangeError error={error} />
          <SelectField
            label={t.fields.seriesId}
            value={values.seriesId}
            onChange={set('seriesId')}
            error={fieldErrors.seriesId}
            options={[
              { value: '', label: '—' },
              ...series.map((s) => ({ value: s.id, label: seriesLabel(s) })),
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t.fields.firstNumber}
              hint={t.hints.firstNumber}
              inputMode="numeric"
              maxLength={30}
              value={values.firstNumber}
              onChange={set('firstNumber')}
              error={fieldErrors.firstNumber}
            />
            <TextField
              label={t.fields.lastNumber}
              inputMode="numeric"
              maxLength={30}
              value={values.lastNumber}
              onChange={set('lastNumber')}
              error={fieldErrors.lastNumber}
            />
          </div>
          <TextField
            label={t.fields.receivedOn}
            type="date"
            value={values.receivedOn}
            onChange={set('receivedOn')}
            error={fieldErrors.receivedOn}
          />
          <TextField
            label={t.fields.insurerReference}
            maxLength={120}
            value={values.insurerReference}
            onChange={set('insurerReference')}
          />
          <TextField
            label={t.fields.location}
            hint={t.hints.location}
            maxLength={120}
            value={values.location}
            onChange={set('location')}
            error={fieldErrors.location}
          />
          <HolderSelect
            value={values.holderId}
            onChange={set('holderId')}
            error={fieldErrors.holderId}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {fr.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !complete}>
              {t.receive}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** One status change for a range of forms of a tracked series (or one form). */
export function MoveDialog({ series, onDone, onClose }) {
  const [values, setValues] = useState({
    seriesId: series[0]?.id ?? '',
    firstNumber: '',
    lastNumber: '',
    to: 'ASSIGNED',
    holderId: '',
    reason: '',
  });
  const { busy, error, fieldErrors, submit, clear } = useRangeSubmit(
    '/attestation-forms/move',
    onDone,
  );
  const set = (name) => (event) => {
    setValues({ ...values, [name]: event.target.value });
    clear(name);
  };
  const needsHolder = ['ASSIGNED', 'AVAILABLE'].includes(values.to);
  const needsReason = ['RETURNED', 'DAMAGED', 'LOST'].includes(values.to);
  const complete =
    values.seriesId &&
    values.firstNumber.trim() &&
    values.lastNumber.trim() &&
    (!needsHolder || values.holderId) &&
    (!needsReason || values.reason.trim());

  return (
    <Dialog title={t.move} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!complete) return;
          const body = { ...values };
          if (!needsHolder) delete body.holderId;
          if (!body.reason.trim()) delete body.reason;
          submit(body);
        }}
        className="space-y-4"
        noValidate
      >
        <RangeError error={error} />
        <SelectField
          label={t.fields.to}
          value={values.to}
          onChange={set('to')}
          options={Object.entries(t.moves).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          label={t.fields.seriesId}
          value={values.seriesId}
          onChange={set('seriesId')}
          options={series.map((s) => ({ value: s.id, label: seriesLabel(s) }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t.fields.firstNumber}
            hint={t.hints.firstNumber}
            inputMode="numeric"
            maxLength={30}
            value={values.firstNumber}
            onChange={set('firstNumber')}
            error={fieldErrors.firstNumber}
          />
          <TextField
            label={t.fields.lastNumber}
            inputMode="numeric"
            maxLength={30}
            value={values.lastNumber}
            onChange={set('lastNumber')}
            error={fieldErrors.lastNumber}
          />
        </div>
        {needsHolder && (
          <HolderSelect
            value={values.holderId}
            onChange={set('holderId')}
            error={fieldErrors.holderId}
            hint={values.to === 'AVAILABLE' ? t.hints.holderAvailable : undefined}
          />
        )}
        {needsReason && (
          <TextField
            label={t.fields.reason}
            hint={t.hints.reason}
            maxLength={200}
            value={values.reason}
            onChange={set('reason')}
            error={fieldErrors.reason}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !complete}>
            {t.moves[values.to]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Every movement of one form, newest first. */
export function FormHistoryDialog({ formId, onClose }) {
  const { state } = useApiQuery(`/attestation-forms/${formId}`);
  const form = state.status === 'done' ? state.data : null;
  return (
    <Dialog
      title={form ? `${t.history} · ${form.series.code} n° ${form.number}` : t.history}
      onClose={onClose}
    >
      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {form && (
        <ol className="space-y-2 text-sm">
          {form.movements.map((m) => (
            <li key={m.id}>
              <span className="font-medium">
                {t.movement({ from: m.from && t.statuses[m.from], to: t.statuses[m.to] })}
              </span>
              {m.toHolder && ` · ${m.toHolder.displayName}`}
              <span className="block text-slate-600">
                {m.by.displayName}, {formatDateTime(m.at)}
                {m.reason && ` · ${m.reason}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
