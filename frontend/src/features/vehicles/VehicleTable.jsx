import { Link } from 'react-router';
import { DataTable } from '../../components/DataTable.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { fr } from '../../i18n/fr.js';

const t = fr.vehicles;

const COLUMNS = [
  {
    key: 'registration',
    header: t.fields.registration,
    primary: true,
    className: 'whitespace-nowrap',
    cell: (vehicle) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Link to={`/vehicules/${vehicle.id}`} className={`${textLinkClasses} font-mono`}>
          {vehicle.registration}
        </Link>
        {vehicle.archivedAt && <StatusBadge tone="neutral">{t.archived}</StatusBadge>}
      </span>
    ),
  },
  { key: 'category', header: t.categoryLabel, cell: (vehicle) => t.categories[vehicle.category] },
  { key: 'make', header: t.fields.make, cell: (vehicle) => `${vehicle.make} ${vehicle.model}` },
  { key: 'owner', header: t.owner, cell: (vehicle) => vehicle.owner.displayName },
  { key: 'fleet', header: t.fleet, cell: (vehicle) => vehicle.fleet?.name ?? t.noFleet },
];

/**
 * Vehicle rows: a table on a computer, cards on a phone. `showOwner` is false on a customer's
 * own page.
 */
export function VehicleTable({ vehicles, showOwner = true }) {
  const columns = showOwner ? COLUMNS : COLUMNS.filter((column) => column.key !== 'owner');
  return <DataTable caption={t.title} columns={columns} rows={vehicles} />;
}
