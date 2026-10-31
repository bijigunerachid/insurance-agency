import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';

const t = fr.contracts;
const FIELDS = ['productId', 'startDate', 'endDate', 'premiumTotal', 'noticeDays', 'tacitRenewal'];

function toForm(contract) {
  return {
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
  if (pending.status === 'loading') return <Spinner label={fr.app.loading} />;
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
      for (const f of ['productId', 'startDate', 'endDate', 'premiumTotal', 'noticeDays']) {
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

  return (
    <div className="space-y-6">
      <Link
        to={back}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {contract ? contract.ref : customer.displayName}
      </Link>
      <h1 className="text-2xl font-semibold">
        {contract ? `${t.edit} · ${contract.ref}` : t.create}
      </h1>
      <p className="text-sm text-slate-600">
        {t.fields.customer} : <span className="font-medium">{customer.displayName}</span> (
        {customer.ref})
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
        {noProducts && <Alert tone="info">{t.noProducts}</Alert>}
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t.sections.contract}</h2>
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
              onChange={set('productId')}
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
          <TextField
            label={t.fields.premiumTotal}
            hint={t.hints.premiumTotal}
            inputMode="decimal"
            maxLength={20}
            value={form.premiumTotal}
            onChange={set('premiumTotal')}
            error={fieldErrors.premiumTotal}
          />
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
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              checked={form.tacitRenewal}
              onChange={(e) => setForm({ ...form, tacitRenewal: e.target.checked })}
              className="size-4 rounded border-slate-300"
            />
            {t.fields.tacitRenewal}
          </label>
        </section>

        {!contract && (
          <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 font-semibold">{t.fields.vehicleIds}</legend>
            <p className="text-sm text-slate-600">{t.hints.vehicleIds}</p>
            {vehicles.state.status === 'loading' && <Spinner label={fr.app.loading} />}
            {vehicles.state.status === 'done' && vehicles.state.data.items.length === 0 && (
              <p className="text-sm">{t.noVehicles}</p>
            )}
            {vehicles.state.status === 'done' &&
              vehicles.state.data.items.map((vehicle) => (
                <label key={vehicle.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={vehicleIds.includes(vehicle.id)}
                    onChange={() => toggleVehicle(vehicle.id)}
                    className="size-4 rounded border-slate-300"
                  />
                  <span className="font-mono">{vehicle.registration}</span>
                  <span className="text-slate-600">
                    {vehicle.make} {vehicle.model}
                    {vehicle.usage ? ` · ${vehicle.usage.label}` : ''}
                  </span>
                </label>
              ))}
            {fieldErrors.vehicleIds && (
              <p className="text-sm text-red-700">{fieldErrors.vehicleIds}</p>
            )}
          </fieldset>
        )}

        <FormActions hint={contract && fr.common.unsaved(changed.length)}>
          <Button variant="secondary" onClick={() => navigate(back)}>
            {fr.common.cancel}
          </Button>
          <Button
            type="submit"
            disabled={
              busy || (contract ? changed.length === 0 : !form.productId || vehicleIds.length === 0)
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
