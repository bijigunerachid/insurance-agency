import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';

const tones = {
  ok: {
    className: 'bg-success-soft text-success-ink ring-success/25',
    icon: 'text-success',
    Icon: CheckCircleIcon,
  },
  error: {
    className: 'bg-danger-soft text-danger-ink ring-danger/25',
    icon: 'text-danger',
    Icon: XCircleIcon,
  },
  warning: {
    className: 'bg-warning-soft text-warning-ink ring-warning/30',
    icon: 'text-warning',
    Icon: ExclamationTriangleIcon,
  },
  neutral: {
    className: 'bg-sunken text-ink-soft ring-line-strong/30',
    icon: 'text-ink-muted',
    Icon: MinusCircleIcon,
  },
};

/** Status shown with an icon and text, never by colour alone. */
export function StatusBadge({ tone, children }) {
  const { className, icon, Icon } = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-control px-2 py-0.5 text-[13px] font-medium ring-1 ring-inset ${className}`}
    >
      <Icon aria-hidden="true" className={`size-3.5 ${icon}`} />
      {children}
    </span>
  );
}
