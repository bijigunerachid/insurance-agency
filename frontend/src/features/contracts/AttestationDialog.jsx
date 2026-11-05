import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate } from '../../utils/format.js';

const t = fr.contracts.attestations;
const rules = fr.contracts.rules;

/**
 * Records an attestation the insurer issued: series, number and dates as printed (rules L15,
 * L27). The API checks the model against the vehicle's usage and the one-month limit.
 */
export function AttestationDialog({ contract, onDone, onClose }) {
  const seriesQuery = useApiQuery('/attestation-series');
  const series =
    seriesQuery.state.status === 'done'
      ? seriesQuery.state.data.items.filter(
          (s) => s.insurer.id === contract.insurer.id && s.status === 'CONFIRMED' && s.active,
        )
      : [];
  const originals = contract.attestations.filter((a) => !a.duplicateOf);
  const [values, setValues] = useState({
    vehicleId: contract.vehicles[0]?.id ?? '',
    seriesId: '',
    number: '',
    validFrom: contract.startDate,
    validTo: contract.endDate,
    medium: 'PAPER',
    coverNoteRef: '',
    duplicateOfId: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const chosen = series.find((s) => s.id === values.seriesId);
  const provisional = chosen?.model.provisional;
  const complete = values.vehicleId && values.seriesId && values.number.trim();

  const set = (name) => (event) => {
    setValues({ ...values, [name]: event.target.value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };
  // A duplicate repeats the original's vehicle, series and number (rule L26).
  const chooseOriginal = (event) => {
    const original = originals.find((a) => a.id === event.target.value);
    setValues(
      original
        ? {
            ...values,
            duplicateOfId: original.id,
            vehicleId: original.vehicle.id,
            seriesId: original.series.id,
            number: original.number,
          }
        : { ...values, duplicateOfId: '' },
    );
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = { ...values };
      if (!provisional || !body.coverNoteRef) delete body.coverNoteRef;
      if (!body.duplicateOfId) delete body.duplicateOfId;
      await onDone(body);
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, rules[d.rule] ?? rules.invalid_format]),
          ),
        );
      }
      setBusy(false);
    }
  }

  return (
    <Dialog title={t.add} onClose={onClose}>
      {seriesQuery.state.status === 'loading' ? (
        <Spinner label={fr.app.loading} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (complete) submit();
          }}
          className="space-y-4"
          noValidate
        >
          {error && <Alert>{errorMessage(error)}</Alert>}
          {series.length === 0 && <Alert tone="info">{t.noSeries}</Alert>}
          {originals.length > 0 && (
            <SelectField
              label={t.duplicateOfId}
              hint={t.hints.duplicateOfId}
              value={values.duplicateOfId}
              onChange={chooseOriginal}
              error={fieldErrors.duplicateOfId}
              options={[
                { value: '', label: t.notDuplicate },
                ...originals.map((a) => ({
                  value: a.id,
                  label: `${a.series.code} n° ${a.number} · ${a.vehicle.registration}`,
                })),
              ]}
            />
          )}
          <SelectField
            label={t.vehicleId}
            value={values.vehicleId}
            onChange={set('vehicleId')}
            error={fieldErrors.vehicleId}
            disabled={Boolean(values.duplicateOfId)}
            options={contract.vehicles.map((v) => ({
              value: v.id,
              label: `${v.registration}${v.usage ? ` · ${v.usage.label}` : ''}`,
            }))}
          />
          <SelectField
            label={t.seriesId}
            hint={provisional ? t.hints.provisional : t.hints.seriesId}
            value={values.seriesId}
            onChange={set('seriesId')}
            error={fieldErrors.seriesId}
            disabled={Boolean(values.duplicateOfId)}
            options={[
              { value: '', label: '—' },
              ...series.map((s) => ({
                value: s.id,
                label: `${s.code} · ${s.model.label}`,
              })),
            ]}
          />
          <TextField
            label={t.number}
            hint={t.hints.number}
            inputMode="numeric"
            maxLength={30}
            autoComplete="off"
            value={values.number}
            onChange={set('number')}
            error={fieldErrors.number}
            readOnly={Boolean(values.duplicateOfId)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t.validFrom}
              type="date"
              value={values.validFrom}
              onChange={set('validFrom')}
              error={fieldErrors.validFrom}
            />
            <TextField
              label={t.validTo}
              type="date"
              value={values.validTo}
              onChange={set('validTo')}
              error={fieldErrors.validTo}
            />
          </div>
          <p className="text-xs text-ink-muted">
            {fr.contracts.fields.period} : {formatDate(contract.startDate)} –{' '}
            {formatDate(contract.endDate)}
          </p>
          <SelectField
            label={t.medium}
            value={values.medium}
            onChange={set('medium')}
            options={Object.entries(t.mediums).map(([value, label]) => ({ value, label }))}
          />
          {provisional && (
            <TextField
              label={t.coverNoteRef}
              hint={t.hints.coverNoteRef}
              maxLength={60}
              value={values.coverNoteRef}
              onChange={set('coverNoteRef')}
              error={fieldErrors.coverNoteRef}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {fr.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !complete}>
              {fr.common.save}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
