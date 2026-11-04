import { useId } from 'react';
import { fr } from '../i18n/fr.js';
import {
  fieldControl,
  fieldError,
  fieldHeight,
  fieldHint,
  fieldLabel,
  fieldOptional,
} from './fieldStyles.js';

/** Labelled input with hint and error text wired to aria-describedby. */
export function TextField({
  label,
  hint,
  error,
  optional = false,
  className = '',
  inputClassName = '',
  ...inputProps
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className={fieldLabel}>
        {label}
        {optional && (
          <>
            {' '}
            <span className={fieldOptional}>{fr.common.optional}</span>
          </>
        )}
      </label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`${fieldControl(error)} ${fieldHeight} ${inputClassName}`}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className={fieldHint}>
          {hint}
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
