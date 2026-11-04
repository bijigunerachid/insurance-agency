import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid';
import { useId, useState } from 'react';
import { fr } from '../i18n/fr.js';
import { fieldControl, fieldError, fieldHeight, fieldHint, fieldLabel } from './fieldStyles.js';

/**
 * A password field: the same look and props as TextField, plus a button that shows the
 * characters typed (hidden again by default and after each sign-in) and a warning while Caps Lock
 * is on, both read by screen readers. The button's name avoids the words « mot de passe », so
 * the field alone answers to its label.
 */
export function PasswordField({ label, hint, error, className = '', ...inputProps }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const capsId = capsLock ? `${id}-caps` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const watchCaps = (event) => setCapsLock(Boolean(event.getModifierState?.('CapsLock')));

  return (
    <div className={className}>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, capsId, errorId].filter(Boolean).join(' ') || undefined}
          onKeyDown={watchCaps}
          onKeyUp={watchCaps}
          onBlur={() => setCapsLock(false)}
          className={`${fieldControl(error)} ${fieldHeight} pr-11`}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? fr.password.hideCharacters : fr.password.showCharacters}
          className="focus-ring absolute right-1 top-1/2 mt-[3px] flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          {shown ? (
            <EyeSlashIcon aria-hidden="true" className="size-4" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-4" />
          )}
          <span className="sr-only">{fr.password.showCharacters}</span>
        </button>
      </div>
      {hint && (
        <p id={hintId} className={fieldHint}>
          {hint}
        </p>
      )}
      {capsLock && (
        <p id={capsId} role="status" className="mt-1.5 text-xs font-medium text-warning-ink">
          {fr.password.capsLock}
        </p>
      )}
      {error && (
        <p id={errorId} className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
