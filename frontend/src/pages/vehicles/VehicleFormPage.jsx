import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import {
  CATEGORY_FIELDS,
  REQUIRED_FIELDS,
  REQUIRED_ONE_OF,
  TECHNICAL_FIELDS,
} from '../../features/vehicles/vehicleFields.js';
import {
  insurerUsageFits,
  insurerUsageOptions,
  legalUsageFor,
} from '../../features/vehicles/insurerUsages.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';

const t = fr.vehicles;
const ALL_FIELDS = [
  'registration',
  'category',
  'make',
  'model',
  'usageId',
  'insurerUsageId',
  ...TECHNICAL_FIELDS,
  'fleetId',
];

function toForm(vehicle) {
  return {
    ...Object.fromEntries(
      ALL_FIELDS.map((f) => [
        f,
        vehicle?.[f] === null || vehicle?.[f] === undefined ? '' : String(vehicle[f]),
      ]),
    ),
    category: vehicle?.category ?? 'CAR',
    fleetId: vehicle?.fleet?.id ?? '',
    usageId: vehicle?.usage?.id ?? '',
    insurerUsageId: vehicle?.insurerUsage?.id ?? '',
  };
}

/** /vehicules/nouveau?client=<id> (create) or /vehicules/:id/modifier (edit). */
export function VehicleFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const existing = useApiQuery(id ? `/vehicles/${id}` : null);
  const ownerId = id ? existing.state.data?.owner.id : params.get('client');
  const owner = useApiQuery(!id && ownerId ? `/customers/${ownerId}` : null);

  if (id && existing.state.status !== 'done') {
    return existing.state.status === 'error' ? (
      <ErrorState
        title={errorMessage(existing.state.error)}
        body={fr.common.genericError}
        requestId={existing.state.error.requestId}
      />
    ) : (
      <Spinner label={fr.app.loading} />
    );
  }
  if (!id) {
    if (!ownerId) return <Alert>{t.intro}</Alert>;
    if (owner.state.status === 'loading') return <Spinner label={fr.app.loading} />;
    if (owner.state.status === 'error') {
      return (
        <ErrorState
          title={errorMessage(owner.state.error)}
          body={fr.common.genericError}
          requestId={owner.state.error.requestId}
        />
      );
    }
  }
  const vehicle = id ? existing.state.data : null;
  const ownerInfo = vehicle ? vehicle.owner : owner.state.data;
  return <VehicleForm vehicle={vehicle} owner={ownerInfo} />;
}

function VehicleForm({ vehicle, owner }) {
  const navigate = useNavigate();
  const fleets = useApiQuery(`/fleets?customerId=${owner.id}`);
  const usages = useApiQuery('/vehicle-usages');
  const insurerUsages = useApiQuery('/insurer-usages');
  const initial = useMemo(() => toForm(vehicle), [vehicle]);
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const changed = ALL_FIELDS.filter((f) => form[f] !== initial[f]);
  const unsavedDialog = useUnsavedChanges(!savedId && changed.length > 0);
  const visible = CATEGORY_FIELDS[form.category];
  const oneOf = REQUIRED_ONE_OF[form.category] ?? [];
  const required = [
    ...(REQUIRED_FIELDS[form.category] ?? []),
    ...(oneOf.some((f) => form[f] !== '') ? [] : oneOf),
  ];
  // Rule L16: only confirmed, active usages can be chosen; the vehicle's current one stays listed.
  const usageOptions =
    usages.state.status === 'done'
      ? usages.state.data.items
          .filter((u) => (u.status === 'CONFIRMED' && u.active) || u.id === vehicle?.usage?.id)
          .map((u) => ({ value: u.id, label: u.label }))
      : [];
  const insurerUsageItems =
    insurerUsages.state.status === 'done' ? insurerUsages.state.data.items : [];
  // A legal usage as the insurer-usage rules read it.
  const usageOf = (id) => {
    const found =
      usages.state.status === 'done' ? usages.state.data.items.find((u) => u.id === id) : null;
    return found && { id: found.id, modelCode: found.model?.code ?? null };
  };
  const back = vehicle ? `/vehicules/${vehicle.id}` : `/clients/${owner.id}`;

  useEffect(() => {
    if (savedId) navigate(`/vehicules/${savedId}`, { replace: !vehicle });
  }, [savedId, navigate, vehicle]);

  function payload() {
    // Fields hidden by the category are cleared, so nothing stale stays on the vehicle.
    const value = (f) =>
      TECHNICAL_FIELDS.includes(f) && !visible.includes(f) ? null : form[f] === '' ? null : form[f];
    if (!vehicle) {
      const body = { ownerId: owner.id };
      for (const f of ALL_FIELDS) if (value(f) !== null) body[f] = value(f);
      return body;
    }
    const body = { version: vehicle.version };
    for (const f of ALL_FIELDS) {
      const next = value(f);
      const before = initial[f] === '' ? null : initial[f];
      if (next !== before) body[f] = next;
    }
    return body;
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = vehicle
        ? await apiSend('PATCH', `/vehicles/${vehicle.id}`, payload())
        : await apiPost('/vehicles', payload());
      setSavedId(result.id);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
        setError(err);
      } else if (
        ['DUPLICATE_REGISTRATION', 'DUPLICATE_VIN'].includes(err.code) &&
        err.details?.candidates
      ) {
        setDuplicate(err.details.candidates[0]);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  // Editing a field clears its error: the message described the old value.
  const set = (name) => (event) => {
    setForm({ ...form, [name]: event.target.value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };
  const text = (name, props = {}) => (
    <TextField
      label={`${t.fields[name]}${required.includes(name) ? ' *' : ''}`}
      value={form[name]}
      onChange={set(name)}
      error={fieldErrors[name]}
      required={required.includes(name)}
      {...props}
    />
  );
  const select = (name, labels) => (
    <SelectField
      label={t.fields[name]}
      value={form[name]}
      onChange={set(name)}
      options={[
        { value: '', label: t.notSpecified },
        ...Object.entries(labels).map(([value, label]) => ({ value, label })),
      ]}
    />
  );
  const technical = {
    fiscalPowerCv: () =>
      text('fiscalPowerCv', {
        type: 'number',
        min: 1,
        max: 100,
        inputMode: 'numeric',
        hint: t.hints.fiscalPowerCv,
      }),
    engineCc: () =>
      text('engineCc', {
        type: 'number',
        min: 1,
        max: 20000,
        inputMode: 'numeric',
        hint: t.hints.engineCc,
      }),
    seats: () =>
      text('seats', {
        type: 'number',
        min: 1,
        max: 100,
        inputMode: 'numeric',
        hint: t.hints.seats,
      }),
    fuel: () => select('fuel', t.fuels),
    taxiType: () => select('taxiType', t.taxiTypes),
    passengerTransportKind: () => select('passengerTransportKind', t.transportKinds),
    firstRegistrationDate: () => text('firstRegistrationDate', { type: 'date' }),
    vin: () => text('vin', { maxLength: 30, autoComplete: 'off', spellCheck: 'false' }),
  };

  return (
    <div className="space-y-6">
      <Link
        to={back}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {vehicle ? vehicle.registration : owner.displayName}
      </Link>
      <h1 className="text-2xl font-semibold">
        {vehicle ? `${t.edit} · ${vehicle.registration}` : t.create}
      </h1>
      <p className="text-sm text-slate-600">
        {t.owner} : <span className="font-medium">{owner.displayName}</span> ({owner.ref})
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="space-y-6"
        noValidate
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t.sections.vehicle}</h2>
          {text('registration', {
            hint: t.hints.registration,
            maxLength: 30,
            autoComplete: 'off',
            spellCheck: 'false',
          })}
          <SelectField
            label={t.fields.category}
            value={form.category}
            onChange={set('category')}
            options={Object.entries(t.categories).map(([value, label]) => ({ value, label }))}
          />
          {text('make', { maxLength: 40, autoComplete: 'off' })}
          {text('model', { maxLength: 60, autoComplete: 'off' })}
          <SelectField
            label={t.fields.insurerUsageId}
            hint={t.hints.insurerUsageId}
            value={form.insurerUsageId}
            onChange={(event) => {
              const chosen = insurerUsageItems.find((u) => u.id === event.target.value);
              // The insurer's usage decides the legal one.
              setForm({
                ...form,
                insurerUsageId: event.target.value,
                ...(chosen
                  ? { usageId: legalUsageFor(chosen, usageOf(form.usageId), form.fuel) }
                  : {}),
              });
              setFieldErrors(({ insurerUsageId: _a, usageId: _b, ...rest }) => rest);
            }}
            error={fieldErrors.insurerUsageId}
            options={[
              { value: '', label: t.notSpecified },
              ...insurerUsageOptions(insurerUsageItems, usageOptions, vehicle?.insurerUsage?.id),
            ]}
          />
          <SelectField
            label={t.fields.usageId}
            hint={t.hints.usageId}
            value={form.usageId}
            onChange={(event) => {
              const kept = insurerUsageItems.find((u) => u.id === form.insurerUsageId);
              // Another legal usage: the insurer's usage chosen before may no longer fit it.
              setForm({
                ...form,
                usageId: event.target.value,
                ...(kept && !insurerUsageFits(kept, usageOf(event.target.value), form.fuel)
                  ? { insurerUsageId: '' }
                  : {}),
              });
              setFieldErrors(({ usageId: _cleared, ...rest }) => rest);
            }}
            error={fieldErrors.usageId}
            options={[{ value: '', label: t.notSpecified }, ...usageOptions]}
          />
        </section>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t.sections.technical}</h2>
          {visible.map((name) => (
            <div key={name}>{technical[name]()}</div>
          ))}
        </section>

        {fleets.state.status === 'done' && fleets.state.data.items.length > 0 && (
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <h2 className="font-semibold sm:col-span-2">{t.sections.management}</h2>
            <SelectField
              label={t.fields.fleetId}
              value={form.fleetId}
              onChange={set('fleetId')}
              options={[
                { value: '', label: t.noFleet },
                ...fleets.state.data.items.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </section>
        )}

        <FormActions hint={vehicle && fr.common.unsaved(changed.length)}>
          <Button variant="secondary" onClick={() => navigate(back)}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || (vehicle && changed.length === 0)}>
            {fr.common.save}
          </Button>
        </FormActions>
      </form>

      {duplicate && (
        <Dialog
          title={t.duplicateTitle}
          onClose={() => setDuplicate(null)}
          footer={
            <Button variant="secondary" onClick={() => setDuplicate(null)}>
              {fr.common.close}
            </Button>
          }
        >
          <p className="text-sm text-slate-700">{t.duplicateIntro}</p>
          <p className="text-sm">
            <Link
              to={`/vehicules/${duplicate.id}`}
              target="_blank"
              rel="noopener"
              className="font-medium text-blue-700 underline"
            >
              {duplicate.registration}
            </Link>{' '}
            · {duplicate.owner.displayName} ({duplicate.owner.ref})
            {duplicate.archived ? ` · ${t.archived}` : ''}
          </p>
        </Dialog>
      )}
      {unsavedDialog}
    </div>
  );
}
