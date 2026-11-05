import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { BORDER_DURATIONS, borderEnd } from '../../features/contracts/borderDurations.js';
import { contractNumber } from '../../features/contracts/contractNumber.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';

const t = fr.contracts;
const FIELDS = [
  'policyNumber',
  'productId',
  'startDate',
  'endDate',
  'premiumTotal',
  'noticeDays',
  'tacitRenewal',
];

function toForm(contract) {
  return {
    policyNumber: contract?.policyNumber ?? '',
    productId: contract?.product.id ?? '',
    startDate: contract?.startDate ?? '',
    endDate: contract?.endDate ?? '',
    premiumTotal: contract?.premiumTotal ?? '',
    noticeDays: contract?.noticeDays ? String(contract.noticeDays) : '',
    tacitRenewal: contract?.tacitRenewal ?? false,
  };
}

/** /contrats/nouveau?client=<id> (create) or /contrats/:id/modifier (a draft only). */
export function ContractFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const existing = useApiQuery(id ? `/contracts/${id}` : null);
  const customerId = id ? existing.state.data?.customer.id : params.get('client');
  const customer = useApiQuery(!id && customerId ? `/customers/${customerId}` : null);

  const pending = id ? existing.state : customer.state;
  if (!id && !customerId) return <Alert>{t.intro}</Alert>;
  if (pending.status === 'loading') return <SkeletonDetail />;
  if (pending.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(pending.error)}
        body={fr.common.genericError}
        requestId={pending.error.requestId}
      />
    );
  }
  const contract = id ? existing.state.data : null;
  return <ContractForm contract={contract} customer={contract?.customer ?? customer.state.data} />;
}

function ContractForm({ contract, customer }) {
  const navigate = useNavigate();
  // Only confirmed, active products can be used (catalogue rule); the current one stays listed.
  const products = useApiQuery('/products?status=CONFIRMED');
  const vehicles = useApiQuery(
    contract ? null : `/vehicles?customerId=${customer.id}&pageSize=100`,
  );
  const initial = useMemo(() => toForm(contract), [contract]);
  const [form, setForm] = useState(initial);
  const [vehicleIds, setVehicleIds] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const changed = FIELDS.filter((f) => form[f] !== initial[f]);
  const unsavedDialog = useUnsavedChanges(
    !savedId && (changed.length > 0 || vehicleIds.length > 0),
  );
  const back = contract ? `/contrats/${contract.id}` : `/clients/${customer.id}`;

  useEffect(() => {
    if (savedId) navigate(`/contrats/${savedId}`, { replace: !contract });
  }, [savedId, navigate, contract]);

  const productOptions =
    products.state.status === 'done'
      ? products.state.data.items
          .filter((p) => p.usable || p.id === contract?.product.id)
          .map((p) => ({ value: p.id, label: `${p.insurer.code} · ${p.name}` }))
      : [];

  function payload() {
    const value = (f) => (form[f] === '' ? null : form[f]);
    if (!contract) {
      const body = { customerId: customer.id, vehicleIds, tacitRenewal: form.tacitRenewal };
      for (const f of [
        'policyNumber',
        'productId',
        'startDate',
        'endDate',
        'premiumTotal',
        'noticeDays',
      ]) {
        if (value(f) !== null) body[f] = value(f);
      }
      return body;
    }
    const body = { version: contract.version };
    for (const f of changed) body[f] = value(f);
    return body;
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = contract
        ? await apiSend('PATCH', `/contracts/${contract.id}`, payload())
        : await apiPost('/contracts', payload());
      setSavedId(result.id);
    } catch (err) {
      if (err.code === 'DUPLICATE_POLICY') setFieldErrors({ policyNumber: errorMessage(err) });
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (name) => (event) => {
    setForm({ ...form, [name]: event.target.value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };
  const toggleVehicle = (id) => {
    setVehicleIds((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
    setFieldErrors(({ vehicleIds: _cleared, ...rest }) => rest);
  };
  const noProducts = products.state.status === 'done' && productOptions.length === 0;
  const product =
    products.state.status === 'done'
      ? products.state.data.items.find((p) => p.id === form.productId)
      : null;
  // Border insurance: a fixed duration, never renewed by itself (rule C5).
  const border = product?.line === 'BORDER';
  const chooseProduct = (event) => {
    const chosen = products.state.data.items.find((p) => p.id === event.target.value);
    setForm({
      ...form,
      productId: event.target.value,
      ...(chosen?.line === 'BORDER' ? { tacitRenewal: false, noticeDays: '' } : {}),
    });
    setFieldErrors(({ productId: _cleared, ...rest }) => rest);
  };
  const chooseDuration = (duration) => {
    setForm({ ...form, endDate: borderEnd(form.startDate, duration) });
    setFieldErrors(({ endDate: _cleared, ...rest }) => rest);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: back, label: contract ? contractNumber(contract) : customer.displayName }}
        title={contract ? `${t.edit} · ${contractNumber(contract)}` : t.create}
        description={
          <>
            {t.fields.customer} :{' '}
            <span className="font-medium text-ink-soft">{customer.displayName}</span> (
            {customer.ref})
          </>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="space-y-6"
        noValidate
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        {noProducts && <Alert tone="info">{t.noProducts}</Alert>}
        <Card title={t.sections.contract}>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* The contract's number in the agency: the insurer's, never one the app makes up. */}
            <TextField
              className="sm:col-span-2"
              label={t.fields.policyNumber}
              hint={t.hints.policyNumber}
              required
              autoComplete="off"
              spellCheck="false"
              maxLength={60}
              inputClassName="font-mono"
              value={form.policyNumber}
              onChange={set('policyNumber')}
              error={fieldErrors.policyNumber}
            />
            {/* The list is shown once loaded: an empty list would read as "no product". */}
            {products.state.status === 'loading' && <Spinner label={fr.app.loading} />}
            {products.state.status === 'error' && (
              <div className="sm:col-span-2">
                <Alert>{errorMessage(products.state.error)}</Alert>
              </div>
            )}
            {products.state.status === 'done' && (
              <SelectField
                className="sm:col-span-2"
                label={t.fields.productId}
                hint={t.hints.productId}
                value={form.productId}
                onChange={chooseProduct}
                error={fieldErrors.productId}
                options={[{ value: '', label: '—' }, ...productOptions]}
              />
            )}
            <TextField
              label={t.fields.startDate}
              type="date"
              value={form.startDate}
              onChange={set('startDate')}
              error={fieldErrors.startDate}
            />
            <TextField
              label={t.fields.endDate}
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              error={fieldErrors.endDate}
            />
            {border && (
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-label text-ink-soft">{t.border.duration}</legend>
                <p className="text-sm text-ink-muted">
                  {form.startDate ? t.border.hint : t.border.startFirst}
                </p>
                <div className="flex flex-wrap gap-2">
                  {BORDER_DURATIONS.map((duration) => (
                    <Button
                      key={duration.key}
                      variant="secondary"
                      className="aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-hover aria-pressed:ring-1 aria-pressed:ring-primary"
                      disabled={!form.startDate}
                      aria-pressed={
                        Boolean(form.startDate) &&
                        form.endDate === borderEnd(form.startDate, duration)
                      }
                      onClick={() => chooseDuration(duration)}
                    >
                      {t.border.durations[duration.key]}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            <TextField
              label={t.fields.premiumTotal}
              hint={t.hints.premiumTotal}
              inputMode="decimal"
              maxLength={20}
              value={form.premiumTotal}
              onChange={set('premiumTotal')}
              error={fieldErrors.premiumTotal}
            />
            {!border && (
              <TextField
                label={t.fields.noticeDays}
                hint={t.hints.noticeDays}
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={form.noticeDays}
                onChange={set('noticeDays')}
                error={fieldErrors.noticeDays}
              />
            )}
            {border ? (
              <p className="text-sm text-ink-muted sm:col-span-2">{t.border.noRenewal}</p>
            ) : (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.tacitRenewal}
                  onChange={(e) => setForm({ ...form, tacitRenewal: e.target.checked })}
                  className="size-4 rounded accent-primary"
                />
                {t.fields.tacitRenewal}
              </label>
            )}
            {fieldErrors.tacitRenewal && (
              <p className="text-sm text-danger-ink sm:col-span-2">{fieldErrors.tacitRenewal}</p>
            )}
          </div>
        </Card>

        {!contract && (
          <fieldset className="rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5">
            {/* Floated, the legend sits inside the box like a heading. */}
            <legend className="float-left w-full text-section text-ink">
              {t.fields.vehicleIds}
            </legend>
            <div className="clear-both space-y-3 pt-1">
              <p className="text-sm text-ink-muted">{t.hints.vehicleIds}</p>
              {vehicles.state.status === 'loading' && <Spinner label={fr.app.loading} />}
              {vehicles.state.status === 'done' && vehicles.state.data.items.length === 0 && (
                <p className="text-sm text-ink-soft">{t.noVehicles}</p>
              )}
              {vehicles.state.status === 'done' && vehicles.state.data.items.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {vehicles.state.data.items.map((vehicle) => (
                    <label
                      key={vehicle.id}
                      className="flex cursor-pointer items-center gap-3 rounded-control border border-line-strong/50 px-3.5 py-3 text-sm hover:bg-sunken/60 has-checked:border-primary has-checked:bg-primary-soft has-checked:ring-1 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                    >
                      <input
                        type="checkbox"
                        checked={vehicleIds.includes(vehicle.id)}
                        onChange={() => toggleVehicle(vehicle.id)}
                        className="size-4 shrink-0 rounded accent-primary focus:outline-none"
                      />
                      <span className="min-w-0">
                        <span className="block font-mono font-medium text-ink">
                          {vehicle.registration}
                        </span>
                        <span className="block text-ink-muted">
                          {vehicle.make} {vehicle.model}
                          {vehicle.usage ? ` · ${vehicle.usage.label}` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {fieldErrors.vehicleIds && (
                <p className="text-sm text-danger-ink">{fieldErrors.vehicleIds}</p>
              )}
            </div>
          </fieldset>
        )}

        <FormActions hint={contract && fr.common.unsaved(changed.length)}>
          <Button variant="secondary" onClick={() => navigate(back)}>
            {fr.common.cancel}
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={
              contract
                ? changed.length === 0
                : !form.policyNumber.trim() || !form.productId || vehicleIds.length === 0
            }
          >
            {fr.common.save}
          </Button>
        </FormActions>
      </form>
      {unsavedDialog}
    </div>
  );
}
