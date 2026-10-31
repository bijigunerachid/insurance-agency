import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { DuplicateDialog } from '../../features/customers/DuplicateDialog.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';

const t = fr.customers;
const FIELDS = [
  'firstName',
  'lastName',
  'legalName',
  'ice',
  'identityType',
  'identityNumber',
  'phone',
  'email',
  'addressLine',
  'city',
  'assignedUserId',
];
const EMPTY = Object.fromEntries(FIELDS.map((f) => [f, '']));

function toForm(customer) {
  return {
    ...Object.fromEntries(FIELDS.map((f) => [f, customer[f] ?? ''])),
    assignedUserId: customer.assignedUser?.id ?? '',
  };
}

export function CustomerFormPage() {
  const { id } = useParams();
  const existing = useApiQuery(id ? `/customers/${id}` : null);
  if (!id) return <CustomerForm />;
  if (existing.state.status === 'loading') return <Spinner label={fr.app.loading} />;
  if (existing.state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(existing.state.error)}
        body={fr.common.genericError}
        requestId={existing.state.error.requestId}
      />
    );
  }
  return <CustomerForm customer={existing.state.data} />;
}

function CustomerForm({ customer }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canAssign = can('customers.assign');
  const assignees = useApiQuery(canAssign ? '/customers/assignees' : null);
  const initial = useMemo(() => (customer ? toForm(customer) : EMPTY), [customer]);
  const [type, setType] = useState(customer?.type ?? 'INDIVIDUAL');
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const changed = FIELDS.filter((f) => form[f] !== initial[f]);
  const dirty = !savedId && (changed.length > 0 || (!customer && type !== 'INDIVIDUAL'));
  const unsavedDialog = useUnsavedChanges(dirty);
  const identityLocked = Boolean(customer?.identityMasked);

  // Navigate only once the form is clean, so the unsaved-changes guard lets us through.
  useEffect(() => {
    if (savedId) navigate(`/clients/${savedId}`, { replace: !customer });
  }, [savedId, navigate, customer]);

  function body(confirmNotDuplicate) {
    const keep = (f) =>
      (type === 'INDIVIDUAL' ? !['legalName', 'ice'].includes(f) : true) &&
      (f !== 'assignedUserId' || canAssign) &&
      !(identityLocked && ['identityType', 'identityNumber'].includes(f));
    const values = (customer ? changed : FIELDS).filter(keep);
    const payload = Object.fromEntries(values.map((f) => [f, form[f] === '' ? null : form[f]]));
    if (!customer) payload.type = type;
    else payload.version = customer.version;
    if (!customer && payload.assignedUserId === null) delete payload.assignedUserId;
    if (confirmNotDuplicate) payload.confirmNotDuplicate = true;
    return payload;
  }

  async function save(confirmNotDuplicate = false) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = customer
        ? await apiSend('PATCH', `/customers/${customer.id}`, body(confirmNotDuplicate))
        : await apiPost('/customers', body(confirmNotDuplicate));
      setDuplicates(null);
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
        ['DUPLICATE_SUSPECTED', 'DUPLICATE_IDENTITY', 'DUPLICATE_ICE'].includes(err.code) &&
        err.details?.candidates
      ) {
        setDuplicates({
          candidates: err.details.candidates,
          hard: err.code !== 'DUPLICATE_SUSPECTED',
        });
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  const field = (name, props = {}) => (
    <TextField
      label={t.fields[name]}
      value={form[name]}
      onChange={(e) => {
        setForm({ ...form, [name]: e.target.value });
        // Editing a field clears its error: the message described the old value.
        setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
      }}
      error={fieldErrors[name]}
      {...props}
    />
  );

  return (
    <div className="space-y-6">
      <Link
        to={customer ? `/clients/${customer.id}` : '/clients'}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {customer ? customer.displayName : t.back}
      </Link>
      <h1 className="text-2xl font-semibold">
        {customer ? `${t.edit} · ${customer.ref}` : t.create}
      </h1>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="space-y-6"
        noValidate
      >
        {error && <Alert>{errorMessage(error)}</Alert>}

        {!customer && (
          <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">{t.typeLabel}</legend>
            <div className="flex flex-wrap gap-4">
              {['INDIVIDUAL', 'BUSINESS'].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="size-4 accent-blue-700"
                  />
                  {t.types[value]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t.sections.identity}</h2>
          {type === 'INDIVIDUAL' ? (
            <>
              {field('firstName', { required: true, maxLength: 80, autoComplete: 'off' })}
              {field('lastName', { required: true, maxLength: 80, autoComplete: 'off' })}
            </>
          ) : (
            <>
              {field('legalName', { required: true, maxLength: 160, autoComplete: 'off' })}
              {field('ice', { hint: t.hints.ice, inputMode: 'numeric', maxLength: 20 })}
            </>
          )}
          <SelectField
            label={t.fields.identityType}
            hint={identityLocked ? t.identityMaskedNote : t.hints.identity}
            disabled={identityLocked}
            value={form.identityType}
            onChange={(e) => setForm({ ...form, identityType: e.target.value })}
            options={[
              { value: '', label: t.noIdentity },
              ...Object.entries(t.identityTypes).map(([value, label]) => ({ value, label })),
            ]}
          />
          {field('identityNumber', {
            disabled: identityLocked || !form.identityType,
            maxLength: 40,
            autoComplete: 'off',
            spellCheck: 'false',
          })}
        </section>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t.sections.contact}</h2>
          {field('phone', { type: 'tel', hint: t.hints.phone, maxLength: 30, autoComplete: 'off' })}
          {field('email', { type: 'email', maxLength: 254, autoComplete: 'off' })}
          {field('addressLine', {
            maxLength: 200,
            className: 'sm:col-span-2',
            autoComplete: 'off',
          })}
          {field('city', { maxLength: 80, autoComplete: 'off' })}
        </section>

        {canAssign && assignees.state.status === 'done' && (
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <h2 className="font-semibold sm:col-span-2">{t.sections.management}</h2>
            <SelectField
              label={t.fields.assignedUserId}
              value={form.assignedUserId}
              onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
              options={[
                { value: '', label: t.unassigned },
                ...assignees.state.data.items.map((u) => ({ value: u.id, label: u.displayName })),
              ]}
            />
          </section>
        )}

        <FormActions hint={customer && fr.common.unsaved(changed.length)}>
          <Button
            variant="secondary"
            onClick={() => navigate(customer ? `/clients/${customer.id}` : '/clients')}
          >
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || (customer && changed.length === 0)}>
            {fr.common.save}
          </Button>
        </FormActions>
      </form>

      {duplicates && (
        <DuplicateDialog
          candidates={duplicates.candidates}
          hard={duplicates.hard}
          busy={busy}
          onCancel={() => setDuplicates(null)}
          onConfirm={() => save(true)}
        />
      )}
      {unsavedDialog}
    </div>
  );
}
