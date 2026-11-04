import { BuildingOffice2Icon, UserIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
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
  if (existing.state.status === 'loading') return <SkeletonDetail />;
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
      <PageHeader
        back={
          customer
            ? { to: `/clients/${customer.id}`, label: customer.displayName }
            : { to: '/clients', label: t.back }
        }
        title={customer ? `${t.edit} · ${customer.ref}` : t.create}
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

        {!customer && (
          <fieldset className="rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5">
            {/* Floated, the legend sits inside the box like a heading. */}
            <legend className="float-left mb-3 w-full text-section text-ink">{t.typeLabel}</legend>
            <div className="clear-both grid gap-3 sm:grid-cols-2">
              {['INDIVIDUAL', 'BUSINESS'].map((value) => {
                const Icon = value === 'INDIVIDUAL' ? UserIcon : BuildingOffice2Icon;
                return (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-control border border-line-strong/50 px-4 py-3 text-sm font-medium text-ink hover:bg-sunken/60 has-checked:border-primary has-checked:bg-primary-soft has-checked:ring-1 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={value}
                      checked={type === value}
                      onChange={() => setType(value)}
                      className="size-4 accent-primary focus:outline-none"
                    />
                    <Icon aria-hidden="true" className="size-5 text-ink-muted" />
                    {t.types[value]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <Card title={t.sections.identity}>
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </Card>

        <Card title={t.sections.contact}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('phone', {
              type: 'tel',
              hint: t.hints.phone,
              maxLength: 30,
              autoComplete: 'off',
            })}
            {field('email', { type: 'email', maxLength: 254, autoComplete: 'off' })}
            {field('addressLine', {
              maxLength: 200,
              className: 'sm:col-span-2',
              autoComplete: 'off',
            })}
            {field('city', { maxLength: 80, autoComplete: 'off' })}
          </div>
        </Card>

        {canAssign && assignees.state.status === 'done' && (
          <Card title={t.sections.management}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t.fields.assignedUserId}
                value={form.assignedUserId}
                onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
                options={[
                  { value: '', label: t.unassigned },
                  ...assignees.state.data.items.map((u) => ({ value: u.id, label: u.displayName })),
                ]}
              />
            </div>
          </Card>
        )}

        <FormActions hint={customer && fr.common.unsaved(changed.length)}>
          <Button
            variant="secondary"
            onClick={() => navigate(customer ? `/clients/${customer.id}` : '/clients')}
          >
            {fr.common.cancel}
          </Button>
          <Button type="submit" loading={busy} disabled={customer && changed.length === 0}>
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
