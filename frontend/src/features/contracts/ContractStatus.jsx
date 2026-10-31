import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';

const t = fr.contracts;

const TONES = {
  DRAFT: 'neutral',
  AWAITING_INSURER: 'warning',
  ISSUED: 'ok',
  SUSPENDED: 'warning',
  CANCELLED: 'error',
};
const PERIOD_TONES = { UPCOMING: 'neutral', ACTIVE: 'ok', EXPIRED: 'error' };

/** Stored status (what the insurer did) and, for an issued contract, the calculated period. */
export function ContractStatus({ contract }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge tone={TONES[contract.status]}>{t.statuses[contract.status]}</StatusBadge>
      {contract.period && (
        <StatusBadge tone={PERIOD_TONES[contract.period]}>{t.periods[contract.period]}</StatusBadge>
      )}
    </span>
  );
}
