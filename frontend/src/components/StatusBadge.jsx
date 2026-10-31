import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';

const tones = {
  ok: { className: 'bg-green-50 text-green-800 ring-green-600/30', Icon: CheckCircleIcon },
  error: { className: 'bg-red-50 text-red-800 ring-red-600/30', Icon: XCircleIcon },
  warning: {
    className: 'bg-amber-50 text-amber-900 ring-amber-600/30',
    Icon: ExclamationTriangleIcon,
  },
  neutral: { className: 'bg-slate-100 text-slate-700 ring-slate-500/30', Icon: MinusCircleIcon },
};

/** Status shown with an icon and text, never by colour alone. */
export function StatusBadge({ tone, children }) {
  const { className, Icon } = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${className}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
}
