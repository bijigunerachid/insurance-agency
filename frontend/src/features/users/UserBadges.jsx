import { fr } from '../../i18n/fr.js';

const styles = {
  green: 'bg-green-50 text-green-800 ring-green-600/30',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/30',
  red: 'bg-red-50 text-red-800 ring-red-600/30',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600/30',
};

function Badge({ color, children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[color]}`}
    >
      {children}
    </span>
  );
}

/** Account state as text badges (never colour alone). */
export function UserBadges({ user }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.active ? (
        <Badge color="green">{fr.users.active}</Badge>
      ) : (
        <Badge color="slate">{fr.users.disabled}</Badge>
      )}
      {user.locked && <Badge color="red">{fr.users.locked}</Badge>}
      {user.mustChangePassword && <Badge color="amber">{fr.users.mustChange}</Badge>}
    </span>
  );
}
