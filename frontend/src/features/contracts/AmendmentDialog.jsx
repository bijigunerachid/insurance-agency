import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDate } from '../../utils/format.js';

const t = fr.contracts.amendments;
const a = fr.contracts.attestations;
const rules = fr.contracts.rules;

/**
 * Records an avenant the insurer issued on an issued contract, as printed, with its new
 * attestation (rule L28): a vehicle change or a registration change. The API moves or renumbers
 * the vehicle, marks the old attestation replaced and adds the avenant's amount to what is owed.
 */
export function AmendmentDialog({ contract, onDone, onClose }) {
  const seriesQuery = useApiQuery('/attestation-series');
  const others = useApiQuery(
    `/vehicles?customerId=${contract.customer.id}&archived=exclude&pageSize=100`,
  );
  const series =
    seriesQuery.state.status === 'done'
      ? seriesQuery.state.data.items.filter(
          (s) =>
            s.insurer.id === contract.insurer.id &&
            s.status === 'CONFIRMED' &&
            s.active &&
            !s.model.provisional,
        )
      : [];
  const candidates =
    others.state.status === 'done'
      ? others.state.data.items.filter((v) => !contract.vehicles.some((c) => c.id === v.id))
      : [];
  const [values, setValues] = useState({
    kind: 'VEHICLE_CHANGE',
    previousVehicleId: contract.vehicles[0]?.id ?? '',
    vehicleId: '',
    registration: '',
    number: '',
    effectiveDate: '',
    amount: '',
    insurerReference: '',
    seriesId: '',
    attestationNumber: '',
    validTo: contract.endDate,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const vehicleChange = values.kind === 'VEHICLE_CHANGE';
  const complete =
    values.previousVehicleId &&
    (vehicleChange ? values.vehicleId : values.registration.trim()) &&
    values.effectiveDate &&
    values.seriesId &&
    values.attestationNumber.trim();

  const set = (name) => (event) => {
    setValues({ ...values, [name]: event.target.value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // The new attestation runs from the avenant's date (owner, 28/10/2026).
      await onDone({
        kind: values.kind,
        number: values.number || null,
        effectiveDate: values.effectiveDate,
        amount: values.amount || null,
        insurerReference: values.insurerReference || null,
        previousVehicleId: values.previousVehicleId,
        ...(vehicleChange
          ? { vehicleId: values.vehicleId }
          : { registration: values.registration }),
        attestation: {
          seriesId: values.seriesId,
          number: values.attestationNumber,
          validFrom: values.effectiveDate,
          validTo: values.validTo,
        },
        version: contract.version,
      });
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        const field = (path) =>
          ({
            'attestation.number': 'attestationNumber',
            'attestation.seriesId': 'seriesId',
            'attestation.validTo': 'validTo',
            number: 'number',
            seriesId: 'seriesId',
            validTo: 'validTo',
            vehicleIds: 'vehicleId',
          })[path] ?? path;
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [field(d.path), rules[d.rule] ?? rules.invalid_format]),
          ),
        );
      }
      setBusy(false);
    }
  }

  const loading = seriesQuery.state.status === 'loading' || others.state.status === 'loading';
  return (
    <Dialog title={t.add} onClose={onClose}>
      {loading ? (
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
          <p className="text-sm text-ink-muted">{t.intro}</p>
          {error && <Alert>{errorMessage(error)}</Alert>}
          <fieldset>
            <legend className="text-sm font-medium text-ink">{t.kind}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {Object.entries(t.kinds).map(([kind, label]) => (
                <label key={kind} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="kind"
                    value={kind}
                    checked={values.kind === kind}
                    onChange={set('kind')}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <SelectField
            label={t.previousVehicleId[values.kind]}
            value={values.previousVehicleId}
            onChange={set('previousVehicleId')}
            error={fieldErrors.previousVehicleId}
            options={contract.vehicles.map((v) => ({
              value: v.id,
              label: `${v.registration} · ${[v.make, v.model].filter(Boolean).join(' ')}`,
            }))}
          />
          {vehicleChange ? (
            candidates.length ? (
              <SelectField
                label={t.vehicleId}
                hint={`${t.hints.vehicleId} ${t.hints.replaced}`}
                value={values.vehicleId}
                onChange={set('vehicleId')}
                error={fieldErrors.vehicleId}
                options={[
                  { value: '', label: '—' },
                  ...candidates.map((v) => ({
                    value: v.id,
                    label: `${v.registration} · ${[v.make, v.model].filter(Boolean).join(' ')}${v.usage ? ` · ${v.usage.label}` : ''}`,
                  })),
                ]}
              />
            ) : (
              <Alert tone="info">
                {t.noOtherVehicle}{' '}
                <Link
                  to={`/vehicules/nouveau?client=${contract.customer.id}`}
                  className="focus-ring rounded-control font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
                >
                  {t.addVehicle}
                </Link>
              </Alert>
            )
          ) : (
            <TextField
              label={t.registration}
              hint={t.hints.registration}
              maxLength={20}
              autoComplete="off"
              value={values.registration}
              onChange={set('registration')}
              error={fieldErrors.registration}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t.number}
              hint={t.hints.number}
              inputMode="numeric"
              maxLength={20}
              autoComplete="off"
              value={values.number}
              onChange={set('number')}
              error={fieldErrors.number}
            />
            <TextField
              label={t.effectiveDate}
              type="date"
              value={values.effectiveDate}
              onChange={set('effectiveDate')}
              error={fieldErrors.effectiveDate}
            />
            <TextField
              label={t.amount}
              hint={t.hints.amount}
              inputMode="decimal"
              maxLength={20}
              autoComplete="off"
              value={values.amount}
              onChange={set('amount')}
              error={fieldErrors.amount}
            />
            <TextField
              label={t.insurerReference}
              maxLength={120}
              value={values.insurerReference}
              onChange={set('insurerReference')}
              error={fieldErrors.insurerReference}
            />
          </div>
          <fieldset className="space-y-4 rounded-card border border-line p-3">
            <legend className="px-1 text-sm font-medium text-ink">{t.attestation}</legend>
            {series.length === 0 && <Alert tone="info">{a.noSeries}</Alert>}
            <SelectField
              label={a.seriesId}
              hint={a.hints.seriesId}
              value={values.seriesId}
              onChange={set('seriesId')}
              error={fieldErrors.seriesId}
              options={[
                { value: '', label: '—' },
                ...series.map((s) => ({ value: s.id, label: `${s.code} · ${s.model.label}` })),
              ]}
            />
            <TextField
              label={a.number}
              hint={a.hints.number}
              inputMode="numeric"
              maxLength={30}
              autoComplete="off"
              value={values.attestationNumber}
              onChange={set('attestationNumber')}
              error={fieldErrors.attestationNumber}
            />
            <TextField
              label={a.validTo}
              type="date"
              value={values.validTo}
              onChange={set('validTo')}
              error={fieldErrors.validTo}
            />
            <p className="text-xs text-ink-muted">
              {fr.contracts.fields.period} : {formatDate(contract.startDate)} –{' '}
              {formatDate(contract.endDate)}
            </p>
          </fieldset>
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
