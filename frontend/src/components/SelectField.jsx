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

/**
 * Labelled native select. `options` = [{ value, label, group? }]; options that follow each other
 * with the same `group` are shown under that heading.
 */
export function SelectField({
  label,
  options,
  hint,
  error,
  optional = false,
  className = '',
  ...selectProps
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
      <select
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`${fieldControl(error)} ${fieldHeight} pr-8`}
        {...selectProps}
      >
        {groupsOf(options).map(({ group, items }) =>
          group ? (
            <optgroup key={group} label={group}>
              {items.map(renderOption)}
            </optgroup>
          ) : (
            items.map(renderOption)
          ),
        )}
      </select>
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

const renderOption = (option) => (
  <option key={option.value} value={option.value}>
    {option.label}
  </option>
);

function groupsOf(options) {
  const groups = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.items.push(option);
    else groups.push({ group: option.group, items: [option] });
  }
  return groups;
}
