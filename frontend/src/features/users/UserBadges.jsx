import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';

/** Account state as badges with an icon and text (never colour alone). */
export function UserBadges({ user }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.active ? (
        <StatusBadge tone="ok">{fr.users.active}</StatusBadge>
      ) : (
        <StatusBadge tone="neutral">{fr.users.disabled}</StatusBadge>
      )}
      {user.locked && <StatusBadge tone="error">{fr.users.locked}</StatusBadge>}
      {user.mustChangePassword && <StatusBadge tone="warning">{fr.users.mustChange}</StatusBadge>}
    </span>
  );
}
