import { PencilSquareIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { DetailItem, DetailList } from '../../components/DetailList.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink, PageHeader } from '../../components/PageHeader.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { CATEGORY_FIELDS } from '../../features/vehicles/vehicleFields.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { usePageTitle } from '../../features/layout/PageTitle.jsx';

const t = fr.vehicles;

const display = {
  fuel: (v) => t.fuels[v],
  taxiType: (v) => t.taxiTypes[v],
  passengerTransportKind: (v) => t.transportKinds[v],
  firstRegistrationDate: (v) => formatDate(v),
};

export function VehicleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/vehicles/${id}`);
  // The header shows « … › {its registration} » once loaded.
  usePageTitle(state.status === 'done' ? state.data.registration : null);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink to="/vehicules">{t.back}</BackLink>}
      />
    );
  }
  const vehicle = state.data;
  const archived = Boolean(vehicle.archivedAt);

  async function act(call) {
    setBusy(true);
    setError(null);
    try {
      await call();
      setArchiving(false);
      reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/vehicules', label: t.back }}
        title={<span className="font-mono">{vehicle.registration}</span>}
        description={`${vehicle.make} ${vehicle.model} · ${t.categories[vehicle.category]}`}
        meta={archived && <StatusBadge tone="neutral">{t.archived}</StatusBadge>}
        actions={
          <>
            {can('vehicles.write') && !archived && (
              <ButtonLink
                to={`/vehicules/${vehicle.id}/modifier`}
                variant="primary"
                icon={PencilSquareIcon}
              >
                {t.edit}
              </ButtonLink>
            )}
            {can('vehicles.archive') && !archived && (
              <Button variant="secondary" onClick={() => setArchiving(true)}>
                {t.archive}
              </Button>
            )}
            {can('vehicles.archive') && archived && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(() =>
                    apiPost(`/vehicles/${vehicle.id}/restore`, { version: vehicle.version }),
                  )
                }
              >
                {t.restore}
              </Button>
            )}
          </>
        }
      />

      {error && !archiving && <Alert>{errorMessage(error)}</Alert>}
      {archived && (
        <Alert tone="info">
          {t.archivedOn} {formatDateTime(vehicle.archivedAt)} : {vehicle.archiveReason}
        </Alert>
      )}

      <Card title={t.sections.vehicle}>
        <DetailList>
          <DetailItem
            label={t.owner}
            value={
              <TextLink to={`/clients/${vehicle.owner.id}`}>
                {vehicle.owner.displayName} ({vehicle.owner.ref})
              </TextLink>
            }
          />
          <DetailItem label={t.fleet} value={vehicle.fleet?.name ?? t.noFleet} />
          <DetailItem label={t.fields.make} value={vehicle.make} empty={t.notSpecified} />
          <DetailItem label={t.fields.model} value={vehicle.model} empty={t.notSpecified} />
          <DetailItem
            label={t.fields.usageId}
            value={vehicle.usage?.label}
            empty={t.notSpecified}
          />
          <DetailItem
            label={t.fields.insurerUsageId}
            value={vehicle.insurerUsage?.label}
            empty={t.notSpecified}
          />
        </DetailList>
      </Card>

      <Card title={t.sections.technical}>
        <DetailList>
          {CATEGORY_FIELDS[vehicle.category].map((name) => (
            <DetailItem
              key={name}
              label={t.fields[name]}
              mono={name === 'vin'}
              empty={t.notSpecified}
              value={
                vehicle[name] === null
                  ? null
                  : display[name]
                    ? display[name](vehicle[name])
                    : vehicle[name]
              }
            />
          ))}
          <DetailItem label={t.createdAt} value={formatDateTime(vehicle.createdAt)} />
        </DetailList>
      </Card>

      {vehicle.amendments?.length > 0 && <AmendmentHistory amendments={vehicle.amendments} />}

      {archiving && (
        <ReasonDialog
          title={t.archiveTitle}
          intro={t.archiveIntro}
          confirmLabel={t.archive}
          busy={busy}
          error={error}
          onCancel={() => setArchiving(false)}
          onConfirm={(reason) =>
            act(() =>
              apiPost(`/vehicles/${vehicle.id}/archive`, { reason, version: vehicle.version }),
            )
          }
        />
      )}
    </div>
  );
}

/** Avenants that renumbered this vehicle or replaced it (owner, 28/10/2026: keep its history). */
function AmendmentHistory({ amendments }) {
  const h = t.history;
  const vehicleLink = (vehicle) => (
    <TextLink to={`/vehicules/${vehicle.id}`} className="font-mono">
      {vehicle.registration}
    </TextLink>
  );
  return (
    <Card title={h.title} flush>
      <ul className="divide-y divide-line text-sm">
        {amendments.map((a) => (
          <li key={a.id} className="space-y-0.5 px-4 py-3 sm:px-5">
            <p className="font-medium text-ink">
              {formatDate(a.effectiveDate)} ·{' '}
              {a.previousRegistration ? (
                h.renumbered(a.previousRegistration, a.registration)
              ) : a.replacedBy ? (
                <>
                  {h.replacedBy} {vehicleLink(a.replacedBy)}
                </>
              ) : a.replaced ? (
                <>
                  {h.replaces} {vehicleLink(a.replaced)}
                </>
              ) : (
                h.joined
              )}
            </p>
            <p className="text-ink-muted">
              {a.number ? h.amendment(a.number) : h.unnumbered} ·{' '}
              <TextLink to={`/contrats/${a.contract.id}`} className="font-mono">
                {a.contract.ref}
              </TextLink>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
