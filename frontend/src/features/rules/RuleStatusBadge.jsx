import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';

const TONES = {
  CONFIRMED: 'ok',
  LAW: 'ok',
  DOCUMENT: 'warning',
  PUBLIC: 'neutral',
  PRESS: 'warning',
  UNKNOWN: 'warning',
};

/** Where the rule stands; the text says it, the colour only helps. */
export function RuleStatusBadge({ status }) {
  return <StatusBadge tone={TONES[status]}>{fr.rules.statuses[status]}</StatusBadge>;
}
