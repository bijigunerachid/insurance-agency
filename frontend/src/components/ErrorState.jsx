import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { fr } from '../i18n/fr.js';

/** Generic, safe error message. Shows only a request reference, never server details. */
export function ErrorState({ title, body, requestId, action }) {
  return (
    <div role="alert" className="rounded-card border border-danger/25 bg-danger-soft p-4">
      <div className="flex gap-3">
        <ExclamationTriangleIcon aria-hidden="true" className="size-6 shrink-0 text-danger" />
        <div className="space-y-2">
          <h2 className="font-semibold text-danger-ink">{title}</h2>
          <p className="text-sm text-ink-soft">{body}</p>
          {requestId && (
            <p className="text-xs text-ink-muted">
              {fr.common.reference} : <span className="font-mono">{requestId}</span>
            </p>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}
