import { ChevronRightIcon, PencilSquareIcon } from '@heroicons/react/20/solid';
import { useId, useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { DetailItem, DetailList } from '../../components/DetailList.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink, PageHeader } from '../../components/PageHeader.jsx';
import { PhoneLink } from '../../components/PhoneLink.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CustomerContractsPanel } from '../../features/contracts/CustomerContractsPanel.jsx';
import { CustomerVehiclesPanel } from '../../features/vehicles/CustomerVehiclesPanel.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDateTime, formatPhone } from '../../utils/format.js';
import { usePageTitle } from '../../features/layout/PageTitle.jsx';

const t = fr.customers;

export function CustomerDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/customers/${id}`);
  // The header shows « … › {its displayName} » once loaded.
  usePageTitle(state.status === 'done' ? state.data.displayName : null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(null);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink to="/clients">{t.back}</BackLink>}
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
      <PageHeader
        back={{ to: '/clients', label: t.back }}
        title={customer.displayName}
        meta={
          <>
            <span className="rounded-control bg-sunken px-2 py-0.5 text-[13px] font-medium text-ink-soft ring-1 ring-inset ring-line-strong/30">
              {t.types[customer.type]}
            </span>
            {archived && <StatusBadge tone="neutral">{t.archived}</StatusBadge>}
            <PhoneLink phone={customer.phone} />
            {customer.city && <span className="text-sm text-ink-soft">{customer.city}</span>}
            <span className="font-mono text-xs text-ink-muted">{customer.ref}</span>
          </>
        }
        actions={
          <>
            {can('customers.write') && !archived && (
              <ButtonLink
                to={`/clients/${customer.id}/modifier`}
                variant="primary"
                icon={PencilSquareIcon}
              >
                {t.edit}
              </ButtonLink>
            )}
            {can('customers.archive') && !archived && (
              <Button variant="secondary" onClick={() => setDialog('archive')}>
                {t.archive}
              </Button>
            )}
            {can('customers.archive') && archived && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(() =>
                    apiPost(`/customers/${customer.id}/restore`, { version: customer.version }),
                  )
                }
              >
                {t.restore}
              </Button>
            )}
          </>
        }
      />

      {error && !dialog && <Alert>{errorMessage(error)}</Alert>}
      {archived && (
        <Alert tone="info">
          {t.archivedOn} {formatDateTime(customer.archivedAt)} : {customer.archiveReason}
        </Alert>
      )}

      {can('contracts.read') && <CustomerContractsPanel customer={customer} />}
      {can('vehicles.read') && <CustomerVehiclesPanel customer={customer} />}

      <details className="group overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-section text-ink hover:bg-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5 [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-5 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          {t.details}
        </summary>
        <div className="divide-y divide-line border-t border-line">
          <DetailSection title={t.sections.identity}>
            {customer.type === 'INDIVIDUAL' ? (
              <>
                <DetailItem label={t.fields.firstName} value={customer.firstName} />
                <DetailItem label={t.fields.lastName} value={customer.lastName} />
              </>
            ) : (
              <>
                <DetailItem label={t.fields.legalName} value={customer.legalName} />
                <DetailItem label={t.fields.ice} value={customer.ice} mono />
              </>
            )}
            <DetailItem
              label={t.fields.identityType}
              value={identity.identityType ? t.identityTypes[identity.identityType] : t.noIdentity}
            />
            <DetailItem
              label={t.fields.identityNumber}
              mono
              value={
                identity.identityNumber && (
                  <span className="flex flex-wrap items-center gap-2">
                    {identity.identityNumber}
                    {customer.identityMasked && !revealed && can('customers.reveal') && (
                      <Button variant="secondary" size="sm" onClick={() => setDialog('reveal')}>
                        {t.reveal}
                      </Button>
                    )}
                  </span>
                )
              }
            />
          </DetailSection>
          <DetailSection title={t.sections.contact}>
            <DetailItem label={t.fields.phone} value={formatPhone(customer.phone)} />
            <DetailItem label={t.fields.email} value={customer.email} />
            <DetailItem label={t.fields.addressLine} value={customer.addressLine} />
            <DetailItem label={t.fields.city} value={customer.city} />
          </DetailSection>
          <DetailSection title={t.sections.management}>
            <DetailItem
              label={t.assignedUser}
              value={customer.assignedUser?.displayName ?? t.unassigned}
            />
            <DetailItem label={t.createdAt} value={formatDateTime(customer.createdAt)} />
          </DetailSection>
        </div>
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

/** One part of the folded details: its name, then its facts. */
function DetailSection({ title, children }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3 px-4 py-4 sm:px-5">
      <h2 id={id} className="text-label text-ink-soft">
        {title}
      </h2>
      <DetailList>{children}</DetailList>
    </section>
  );
}
