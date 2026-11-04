import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/20/solid';

const tones = {
  error: {
    box: 'border-danger/25 bg-danger-soft text-danger-ink',
    icon: 'text-danger',
    Icon: ExclamationCircleIcon,
  },
  info: {
    box: 'border-primary/20 bg-primary-soft text-ink-soft',
    icon: 'text-primary',
    Icon: InformationCircleIcon,
  },
  // Something to check before going on, never a refusal.
  warning: {
    box: 'border-warning/30 bg-warning-soft text-warning-ink',
    icon: 'text-warning',
    Icon: ExclamationTriangleIcon,
  },
  // Done: the thing asked for was saved.
  success: {
    box: 'border-success/25 bg-success-soft text-success-ink',
    icon: 'text-success',
    Icon: CheckCircleIcon,
  },
};

/** Short message above a form. Errors are announced to screen readers. */
export function Alert({ tone = 'error', children }) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-card border px-3.5 py-3 text-sm ${box}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${icon}`} />
      <div>{children}</div>
    </div>
  );
}
