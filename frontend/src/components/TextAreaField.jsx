import { useId } from 'react';
import { fr } from '../i18n/fr.js';
import { fieldControl, fieldError, fieldHint, fieldLabel, fieldOptional } from './fieldStyles.js';

/** Labelled multi-line input with hint and error text wired to aria-describedby. */
export function TextAreaField({
  label,
  hint,
  error,
  optional = false,
  className = '',
  rows = 4,
  ...props
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
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`${fieldControl(error)} py-2`}
        {...props}
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
