import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { VehicleTable } from './VehicleTable.jsx';

const t = fr.vehicles;

/** Vehicles and fleets on a customer's page. */
export function CustomerVehiclesPanel({ customer }) {
  const { can } = useAuth();
  const canWrite = can('vehicles.write') && !customer.archivedAt;
  const vehicles = useApiQuery(`/vehicles?customerId=${customer.id}&archived=include&pageSize=100`);
  const fleets = useApiQuery(`/fleets?customerId=${customer.id}`);
  const [name, setName] = useState('');
  // The fleet form only when asked for: most customers have one or two vehicles.
  const [addingFleet, setAddingFleet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function createFleet(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost('/fleets', { customerId: customer.id, name: name.trim() });
      setName('');
      setAddingFleet(false);
      fleets.reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section aria-labelledby="vehicles-heading" className="space-y-3">
        <SectionHeading
          id="vehicles-heading"
          title={t.title}
          actions={
            canWrite && (
              <ButtonLink to={`/vehicules/nouveau?client=${customer.id}`} size="sm" icon={PlusIcon}>
                {t.create}
              </ButtonLink>
            )
          }
        />
        {vehicles.state.status === 'loading' && <SkeletonList rows={2} />}
        {vehicles.state.status === 'error' && <Alert>{errorMessage(vehicles.state.error)}</Alert>}
        {vehicles.state.status === 'done' &&
          (vehicles.state.data.items.length ? (
            <VehicleTable vehicles={vehicles.state.data.items} showOwner={false} />
          ) : (
            <EmptyState title={t.none} />
          ))}
      </section>

      {fleets.state.status === 'done' &&
        fleets.state.data.items.length === 0 &&
        canWrite &&
        !addingFleet && (
          <section
            aria-labelledby="fleets-heading"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-dashed border-line-strong/50 bg-surface px-4 py-2.5 text-sm"
          >
            <h2 id="fleets-heading" className="font-semibold text-ink">
              {t.fleets.title}
            </h2>
            <span className="flex-1 text-ink-muted">{t.fleets.none}</span>
            <Button
              variant="secondary"
              size="sm"
              icon={PlusIcon}
              onClick={() => setAddingFleet(true)}
            >
              {fr.customers.newFleet}
            </Button>
          </section>
        )}
      {(fleets.state.data?.items?.length > 0 || (canWrite && addingFleet)) && (
        <section
          aria-labelledby="fleets-heading"
          className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-hairline sm:p-5"
        >
          <SectionHeading
            id="fleets-heading"
            title={t.fleets.title}
            actions={
              canWrite &&
              !addingFleet && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={PlusIcon}
                  onClick={() => setAddingFleet(true)}
                >
                  {fr.customers.newFleet}
                </Button>
              )
            }
          />
          {fleets.state.status === 'done' &&
            (fleets.state.data.items.length ? (
              <ul className="divide-y divide-line text-sm">
                {fleets.state.data.items.map((fleet) => (
                  <li key={fleet.id} className="flex justify-between gap-2 py-2.5">
                    <TextLink to={`/vehicules?flotte=${fleet.id}`}>{fleet.name}</TextLink>
                    <span className="text-ink-muted">{t.fleets.vehicles(fleet.vehicleCount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{t.fleets.none}</p>
            ))}
          {canWrite && addingFleet && (
            <form onSubmit={createFleet} className="flex flex-wrap items-end gap-2" noValidate>
              {error && (
                <div className="w-full">
                  <Alert>{errorMessage(error)}</Alert>
                </div>
              )}
              <TextField
                className="min-w-48 flex-1"
                label={t.fleets.name}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Button type="submit" loading={busy} disabled={!name.trim()}>
                {t.fleets.create}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setAddingFleet(false)}>
                {fr.common.cancel}
              </Button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
