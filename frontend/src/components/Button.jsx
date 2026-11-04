import { Link } from 'react-router';

const variants = {
  primary: 'bg-primary text-white shadow-hairline hover:bg-primary-hover disabled:bg-primary/45',
  danger: 'bg-danger text-white shadow-hairline hover:bg-danger-hover disabled:bg-danger/45',
  secondary:
    'bg-surface text-ink ring-1 ring-inset ring-line-strong/70 shadow-hairline hover:bg-canvas disabled:text-ink-muted disabled:ring-line',
  // Quiet: actions beside a title, in menus and toolbars.
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink disabled:text-ink-muted',
};

const sizes = {
  sm: 'min-h-8 gap-1.5 px-2.5 py-1 text-[13px]',
  md: 'min-h-9 gap-2 px-3.5 py-1.5 text-sm',
  lg: 'min-h-11 gap-2 px-5 py-2 text-[15px]',
};
// Square buttons that show only an icon (their name is given by `label`).
const iconSizes = { sm: 'size-8', md: 'size-9', lg: 'size-11' };

/**
 * The classes of a button, for the rare element that must look like one without being a
 * <button> (a link to another page: see ButtonLink).
 */
export function buttonClasses({ variant = 'primary', size = 'md', iconOnly = false } = {}) {
  return [
    // Long French labels wrap on a narrow phone rather than pushing the page sideways.
    'focus-ring inline-flex select-none items-center justify-center text-center leading-5 rounded-control font-semibold transition-colors duration-150 disabled:cursor-not-allowed',
    iconOnly ? `${iconSizes[size]} p-0` : sizes[size],
    variants[variant],
  ].join(' ');
}

function Busy() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

/**
 * The application's button. `loading` shows a turning sign, keeps the label (no jump in width)
 * and refuses a second click; `icon` puts a Heroicon before the label; `iconOnly` shows the
 * icon alone and keeps `children` as the name read by screen readers.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  icon: Icon,
  iconOnly = false,
  disabled,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses({ variant, size, iconOnly })} ${className}`}
      {...props}
    >
      {loading ? <Busy /> : Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}

/** A link to another page that looks like a button (same variants and sizes). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...props
}) {
  return (
    <Link className={`${buttonClasses({ variant, size })} ${className}`} {...props}>
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </Link>
  );
}
