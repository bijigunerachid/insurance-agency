import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Spinner } from '../../components/Spinner.jsx';
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
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{vehicle.registration}</h1>
          <p className="text-sm text-slate-600">
            {vehicle.make} {vehicle.model} · {t.categories[vehicle.category]}
            {archived && ` · ${t.archived}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('vehicles.write') && !archived && (
            <Link
              to={`/vehicules/${vehicle.id}/modifier`}
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <PencilSquareIcon aria-hidden="true" className="size-4" />
              {t.edit}
            </Link>
          )}
          {can('vehicles.archive') && !archived && (
            <Button variant="secondary" onClick={() => setArchiving(true)}>
              {t.archive}
            </Button>
          )}
          {can('vehicles.archive') && archived && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                act(() => apiPost(`/vehicles/${vehicle.id}/restore`, { version: vehicle.version }))
              }
            >
              {t.restore}
            </Button>
          )}
        </div>
      </div>

      {error && !archiving && <Alert>{errorMessage(error)}</Alert>}
      {archived && (
        <Alert tone="info">
          {t.archivedOn} {formatDateTime(vehicle.archivedAt)} : {vehicle.archiveReason}
        </Alert>
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">{t.sections.vehicle}</h2>
        <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
          <Item
            label={t.owner}
            value={
              <Link to={`/clients/${vehicle.owner.id}`} className="text-blue-700 underline">
                {vehicle.owner.displayName} ({vehicle.owner.ref})
              </Link>
            }
          />
          <Item label={t.fleet} value={vehicle.fleet?.name ?? t.noFleet} />
          <Item label={t.fields.make} value={vehicle.make} />
          <Item label={t.fields.model} value={vehicle.model} />
          <Item label={t.fields.usageId} value={vehicle.usage?.label} />
          <Item label={t.fields.insurerUsageId} value={vehicle.insurerUsage?.label} />
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">
          {t.sections.technical}
        </h2>
        <dl className="grid gap-px bg-slate-200 text-sm sm:grid-cols-2">
          {CATEGORY_FIELDS[vehicle.category].map((name) => (
            <Item
              key={name}
              label={t.fields[name]}
              mono={name === 'vin'}
              value={
                vehicle[name] === null
                  ? null
                  : display[name]
                    ? display[name](vehicle[name])
                    : vehicle[name]
              }
            />
          ))}
          <Item label={t.createdAt} value={formatDateTime(vehicle.createdAt)} />
        </dl>
      </section>

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
    <Link to={`/vehicules/${vehicle.id}`} className="font-mono text-blue-700 underline">
      {vehicle.registration}
    </Link>
  );
  return (
    <section
      aria-labelledby="vehicle-history"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <h2 id="vehicle-history" className="border-b border-slate-200 px-4 py-3 font-semibold">
        {h.title}
      </h2>
      <ul className="divide-y divide-slate-200 text-sm">
        {amendments.map((a) => (
          <li key={a.id} className="space-y-0.5 px-4 py-3">
            <p className="font-medium">
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
            <p className="text-slate-600">
              {a.number ? h.amendment(a.number) : h.unnumbered} ·{' '}
              <Link to={`/contrats/${a.contract.id}`} className="font-mono text-blue-700 underline">
                {a.contract.ref}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Item({ label, value, mono }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`mt-0.5 font-medium ${mono ? 'font-mono' : ''}`}>
        {value === null || value === undefined || value === '' ? t.notSpecified : value}
      </dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/vehicules"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
