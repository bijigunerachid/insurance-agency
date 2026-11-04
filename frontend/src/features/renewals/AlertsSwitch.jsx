import { BellAlertIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { fr } from '../../i18n/fr.js';
import { alertsSupported } from './useRenewalAlerts.js';

const t = fr.alerts;

/**
 * Lets the employee allow Windows notifications on this PC. The browser only asks after a
 * click, and remembers the answer for this site.
 */
export function AlertsSwitch() {
  const [permission, setPermission] = useState(() =>
    alertsSupported() ? window.Notification.permission : 'unsupported',
  );
  if (permission === 'granted') {
    return (
      <p className="flex items-center gap-2 text-sm text-success-ink">
        <BellAlertIcon aria-hidden="true" className="size-5" />
        {t.on}
      </p>
    );
  }
  // Blocked or not possible here: a quiet line, not a box on the home page every day.
  if (permission !== 'default') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <BellAlertIcon aria-hidden="true" className="size-4" />
        {permission === 'denied' ? t.blocked : t.unsupported}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-soft shadow-hairline">
      <BellAlertIcon aria-hidden="true" className="size-5 text-ink-muted" />
      <span className="min-w-0 flex-1">
        {permission === 'denied' ? t.blocked : permission === 'unsupported' ? t.unsupported : t.ask}
      </span>
      {permission === 'default' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => setPermission(await window.Notification.requestPermission())}
        >
          {t.enable}
        </Button>
      )}
    </div>
  );
}
