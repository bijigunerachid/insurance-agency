import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ChoicePills } from '../../components/ChoicePills.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { Skeleton } from '../../components/Skeleton.jsx';
import { TextAreaField } from '../../components/TextAreaField.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatMoney } from '../../utils/format.js';

const t = fr.remittances;

/** Last day of the month before `today` ("2026-11-05" → "2026-10-31"). */
function endOfPreviousMonth(today) {
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

/**
 * Records a remittance made to the insurer. The previous months are proposed when they are owed
 * (rule L5: due 15 days after the month); the amount comes from the server and is sent back, so a
 * payment recorded meanwhile is never remitted without being seen. The request id is created when
 * the dialog opens: clicking twice records one remittance.
 */
export function RecordRemittanceDialog({ insurer, today, requestId, onClose, onDone }) {
  const currentMonth = today.slice(0, 7);
  const previousOwed = insurer.months.some((m) => m.month < currentMonth && Number(m.amount) > 0);
  const [values, setValues] = useState({
    collectedUntil: previousOwed ? endOfPreviousMonth(today) : today,
    method: 'TRANSFER',
    reference: '',
    remittedOn: today,
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(values.collectedUntil);
  const preview = useApiQuery(
    validDate
      ? `/remittances/outstanding?insurerId=${insurer.id}&collectedUntil=${values.collectedUntil}`
      : null,
  );
  const amount = preview.state.status === 'done' ? preview.state.data.amount : null;
  const needsReference = values.method !== 'CASH';
  const complete =
    amount !== null &&
    Number(amount) > 0 &&
    values.remittedOn &&
    (!needsReference || values.reference.trim());

  const change = (name, value) => {
    setValues({ ...values, [name]: value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };
  const set = (name) => (event) => change(name, event.target.value);

  async function submit(event) {
    event.preventDefault();
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        insurerId: insurer.id,
        collectedUntil: values.collectedUntil,
        expectedAmount: amount,
        method: values.method,
        remittedOn: values.remittedOn,
        idempotencyKey: requestId,
      };
      if (values.reference.trim()) body.reference = values.reference;
      if (values.note.trim()) body.note = values.note;
      onDone(await apiPost('/remittances', body));
    } catch (err) {
      setError(err);
      if (err.code === 'AMOUNT_CHANGED') preview.reload({ silent: true });
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

  return (
    <Dialog title={t.recordTitle(insurer.name)} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-ink-soft">{t.recordIntro}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <TextField
          label={t.collectedUntil}
          type="date"
          max={today}
          value={values.collectedUntil}
          onChange={set('collectedUntil')}
          error={fieldErrors.collectedUntil}
        />
        <div aria-live="polite">
          {preview.state.status === 'loading' && validDate && (
            <div role="status" aria-busy="true" className="rounded-card bg-sunken px-3.5 py-3">
              <span className="sr-only">{fr.app.loading}</span>
              <Skeleton className="h-5 w-56 max-w-full bg-line" />
            </div>
          )}
          {preview.state.status === 'error' && <Alert>{errorMessage(preview.state.error)}</Alert>}
          {preview.state.status === 'done' &&
            (Number(amount) > 0 ? (
              <p className="rounded-card border border-primary/20 bg-primary-soft px-3.5 py-3 text-sm font-semibold tabular-nums text-ink">
                {t.preview(formatMoney(amount), t.count(preview.state.data.items.length))}
              </p>
            ) : (
              <Alert tone="info">{t.previewNothing}</Alert>
            ))}
        </div>
        <ChoicePills
          label={t.method}
          value={values.method}
          onChange={(method) => change('method', method)}
          options={Object.entries(t.methods).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          label={t.reference[values.method]}
          maxLength={80}
          value={values.reference}
          onChange={set('reference')}
          error={fieldErrors.reference}
        />
        <TextField
          label={t.remittedOn}
          type="date"
          max={today}
          value={values.remittedOn}
          onChange={set('remittedOn')}
          error={fieldErrors.remittedOn}
        />
        <TextAreaField
          label={t.note}
          rows={2}
          maxLength={300}
          value={values.note}
          onChange={set('note')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" loading={busy} disabled={!complete}>
            {t.record}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
