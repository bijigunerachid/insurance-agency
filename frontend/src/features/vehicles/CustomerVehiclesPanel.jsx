import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Spinner } from '../../components/Spinner.jsx';
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="vehicles-heading" className="text-lg font-semibold">
            {t.title}
          </h2>
          {canWrite && (
            <Link
              to={`/vehicules/nouveau?client=${customer.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              {t.create}
            </Link>
          )}
        </div>
        {vehicles.state.status === 'loading' && <Spinner label={fr.app.loading} />}
        {vehicles.state.status === 'error' && <Alert>{errorMessage(vehicles.state.error)}</Alert>}
        {vehicles.state.status === 'done' &&
          (vehicles.state.data.items.length ? (
            <VehicleTable vehicles={vehicles.state.data.items} showOwner={false} />
          ) : (
            <p className="text-sm text-slate-600">{t.none}</p>
          ))}
      </section>

      {fleets.state.status === 'done' &&
        fleets.state.data.items.length === 0 &&
        canWrite &&
        !addingFleet && (
          <section
            aria-labelledby="fleets-heading"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm"
          >
            <h2 id="fleets-heading" className="font-medium">
              {t.fleets.title}
            </h2>
            <span className="flex-1 text-slate-600">{t.fleets.none}</span>
            <Button variant="secondary" onClick={() => setAddingFleet(true)}>
              <PlusIcon aria-hidden="true" className="size-4" />
              {fr.customers.newFleet}
            </Button>
          </section>
        )}
      {(fleets.state.data?.items?.length > 0 || (canWrite && addingFleet)) && (
        <section
          aria-labelledby="fleets-heading"
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="fleets-heading" className="font-semibold">
              {t.fleets.title}
            </h2>
            {canWrite && !addingFleet && (
              <Button variant="secondary" onClick={() => setAddingFleet(true)}>
                <PlusIcon aria-hidden="true" className="size-4" />
                {fr.customers.newFleet}
              </Button>
            )}
          </div>
          {fleets.state.status === 'done' &&
            (fleets.state.data.items.length ? (
              <ul className="divide-y divide-slate-200 text-sm">
                {fleets.state.data.items.map((fleet) => (
                  <li key={fleet.id} className="flex justify-between gap-2 py-2">
                    <Link to={`/vehicules?flotte=${fleet.id}`} className="font-medium">
                      {fleet.name}
                    </Link>
                    <span className="text-slate-600">{t.fleets.vehicles(fleet.vehicleCount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">{t.fleets.none}</p>
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
              <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
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
