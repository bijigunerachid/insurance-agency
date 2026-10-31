import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { fr } from '../i18n/fr.js';

/** Generic, safe error message. Shows only a request reference, never server details. */
export function ErrorState({ title, body, requestId, action }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex gap-3">
        <ExclamationTriangleIcon aria-hidden="true" className="size-6 shrink-0 text-red-700" />
        <div className="space-y-2">
          <h2 className="font-semibold text-red-900">{title}</h2>
          <p className="text-sm text-red-800">{body}</p>
          {requestId && (
            <p className="text-xs text-red-700">
              {fr.common.reference} : <span className="font-mono">{requestId}</span>
            </p>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}
