import { PhoneIcon } from '@heroicons/react/20/solid';
import { formatPhone } from '../utils/format.js';

/**
 * A client's number that calls them (on a phone, or through the PC's softphone), shown the
 * familiar way (06 12 34 56 78). `relative` keeps it clickable above a card-wide link.
 */
export function PhoneLink({ phone }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      className="focus-ring relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-hover ring-1 ring-inset ring-primary/25 hover:bg-primary/10"
    >
      <PhoneIcon aria-hidden="true" className="size-4" />
      {formatPhone(phone)}
    </a>
  );
}
