import { useId } from 'react';

/**
 * Labelled native select. `options` = [{ value, label, group? }]; options that follow each other
 * with the same `group` are shown under that heading.
 */
export function SelectField({ label, options, hint, error, className = '', ...selectProps }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-0 focus:outline-blue-700 ${
          error ? 'border-red-500' : 'border-slate-300'
        }`}
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
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700">
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
