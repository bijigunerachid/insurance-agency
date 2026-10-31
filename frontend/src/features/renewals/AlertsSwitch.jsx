import { BellAlertIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
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
      <p className="flex items-center gap-2 text-sm text-green-800">
        <BellAlertIcon aria-hidden="true" className="size-5" />
        {t.on}
      </p>
    );
  }
  // Blocked or not possible here: a quiet line, not a box on the home page every day.
  if (permission !== 'default') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <BellAlertIcon aria-hidden="true" className="size-4" />
        {permission === 'denied' ? t.blocked : t.unsupported}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <BellAlertIcon aria-hidden="true" className="size-5 text-slate-500" />
      <span className="flex-1">
        {permission === 'denied' ? t.blocked : permission === 'unsupported' ? t.unsupported : t.ask}
      </span>
      {permission === 'default' && (
        <button
          type="button"
          onClick={async () => setPermission(await window.Notification.requestPermission())}
          className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          {t.enable}
        </button>
      )}
    </div>
  );
}
