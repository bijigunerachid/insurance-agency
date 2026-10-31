import { Link } from 'react-router';
import { fr } from '../../i18n/fr.js';

const t = fr.vehicles;

/** Vehicle rows; `showOwner` is false on a customer's own page. */
export function VehicleTable({ vehicles, showOwner = true }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t.fields.registration}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.categoryLabel}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.fields.make}
            </th>
            {showOwner && (
              <th scope="col" className="px-4 py-3">
                {t.owner}
              </th>
            )}
            <th scope="col" className="px-4 py-3">
              {t.fleet}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id}>
              <td className="whitespace-nowrap px-4 py-3">
                <Link
                  to={`/vehicules/${vehicle.id}`}
                  className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  {vehicle.registration}
                </Link>
                {vehicle.archivedAt && (
                  <span className="ml-2 text-xs text-slate-500">{t.archived}</span>
                )}
              </td>
              <td className="px-4 py-3">{t.categories[vehicle.category]}</td>
              <td className="px-4 py-3">
                {vehicle.make} {vehicle.model}
              </td>
              {showOwner && <td className="px-4 py-3">{vehicle.owner.displayName}</td>}
              <td className="px-4 py-3">{vehicle.fleet?.name ?? t.noFleet}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
