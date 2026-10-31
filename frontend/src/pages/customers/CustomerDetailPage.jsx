import { ArrowLeftIcon, PencilSquareIcon, PhoneIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CustomerContractsPanel } from '../../features/contracts/CustomerContractsPanel.jsx';
import { CustomerVehiclesPanel } from '../../features/vehicles/CustomerVehiclesPanel.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDateTime, formatPhone } from '../../utils/format.js';

const t = fr.customers;

export function CustomerDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/customers/${id}`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(null);

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
  const customer = state.data;
  const archived = Boolean(customer.archivedAt);

  async function act(call, after) {
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      after?.(result);
      setDialog(null);
      reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const identity = revealed ?? customer;

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{customer.displayName}</h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {t.types[customer.type]}
            </span>
            {archived && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-500/30">
                {t.archived}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <PhoneIcon aria-hidden="true" className="size-4" />
                {formatPhone(customer.phone)}
              </a>
            )}
            {customer.city && <span>{customer.city}</span>}
            <span className="text-xs text-slate-500">{customer.ref}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('customers.write') && !archived && (
            <Link
              to={`/clients/${customer.id}/modifier`}
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <PencilSquareIcon aria-hidden="true" className="size-4" />
              {t.edit}
            </Link>
          )}
          {can('customers.archive') && !archived && (
            <Button variant="secondary" onClick={() => setDialog('archive')}>
              {t.archive}
            </Button>
          )}
          {can('customers.archive') && archived && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                act(() =>
                  apiPost(`/customers/${customer.id}/restore`, { version: customer.version }),
                )
              }
            >
              {t.restore}
            </Button>
          )}
        </div>
      </div>

      {error && !dialog && <Alert>{errorMessage(error)}</Alert>}
      {archived && (
        <Alert tone="info">
          {t.archivedOn} {formatDateTime(customer.archivedAt)} : {customer.archiveReason}
        </Alert>
      )}

      {can('contracts.read') && <CustomerContractsPanel customer={customer} />}
      {can('vehicles.read') && <CustomerVehiclesPanel customer={customer} />}

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden hover:bg-slate-50">
          <span
            className="mr-2 inline-block transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
          {t.details}
        </summary>
        <section className="border-t border-slate-200">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">
            {t.sections.identity}
          </h2>
          <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
            {customer.type === 'INDIVIDUAL' ? (
              <>
                <Item label={t.fields.firstName} value={customer.firstName} />
                <Item label={t.fields.lastName} value={customer.lastName} />
              </>
            ) : (
              <>
                <Item label={t.fields.legalName} value={customer.legalName} />
                <Item label={t.fields.ice} value={customer.ice} mono />
              </>
            )}
            <Item
              label={t.fields.identityType}
              value={identity.identityType ? t.identityTypes[identity.identityType] : t.noIdentity}
            />
            <Item
              label={t.fields.identityNumber}
              mono
              value={
                identity.identityNumber && (
                  <span className="flex flex-wrap items-center gap-2">
                    {identity.identityNumber}
                    {customer.identityMasked && !revealed && can('customers.reveal') && (
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => setDialog('reveal')}
                      >
                        {t.reveal}
                      </Button>
                    )}
                  </span>
                )
              }
            />
          </dl>
        </section>

        <section className="border-t border-slate-200">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">
            {t.sections.contact}
          </h2>
          <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
            <Item label={t.fields.phone} value={formatPhone(customer.phone)} />
            <Item label={t.fields.email} value={customer.email} />
            <Item label={t.fields.addressLine} value={customer.addressLine} />
            <Item label={t.fields.city} value={customer.city} />
          </dl>
        </section>

        <section className="border-t border-slate-200">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">
            {t.sections.management}
          </h2>
          <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
            <Item
              label={t.assignedUser}
              value={customer.assignedUser?.displayName ?? t.unassigned}
            />
            <Item label={t.createdAt} value={formatDateTime(customer.createdAt)} />
          </dl>
        </section>
      </details>

      {dialog === 'archive' && (
        <ReasonDialog
          title={t.archiveTitle}
          intro={t.archiveIntro}
          confirmLabel={t.archive}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) =>
            act(() =>
              apiPost(`/customers/${customer.id}/archive`, { reason, version: customer.version }),
            )
          }
        />
      )}
      {dialog === 'reveal' && (
        <ReasonDialog
          title={t.revealTitle}
          intro={t.revealIntro}
          confirmLabel={t.reveal}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) =>
            act(() => apiPost(`/customers/${customer.id}/reveal-identity`, { reason }), setRevealed)
          }
        />
      )}
    </div>
  );
}

function Item({ label, value, mono }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`mt-0.5 font-medium ${mono ? 'font-mono' : ''}`}>{value || fr.common.none}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/clients"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
