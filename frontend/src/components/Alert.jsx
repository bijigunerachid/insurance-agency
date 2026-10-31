import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/20/solid';

const tones = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', Icon: ExclamationCircleIcon },
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', Icon: InformationCircleIcon },
  // Something to check before going on, never a refusal.
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-900', Icon: ExclamationTriangleIcon },
};

/** Short message above a form. Errors are announced to screen readers. */
export function Alert({ tone = 'error', children }) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-2 rounded-md border p-3 text-sm ${box}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
