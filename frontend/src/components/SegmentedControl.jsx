import { useId } from 'react';

/**
 * A few choices side by side, one chosen (a list's status filter). Real radio buttons under the
 * look: the arrow keys move between them and screen readers say « 1 sur 4 ».
 * `gridOnPhone`: two even columns on a phone, for labels too long to fit on one line.
 */
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  className = '',
  gridOnPhone = false,
}) {
  const name = useId();
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-1.5 text-label text-ink-soft">{label}</legend>
      <div
        className={`${gridOnPhone ? 'grid grid-cols-2 text-center sm:inline-flex' : 'inline-flex'} max-w-full flex-wrap gap-1 rounded-control border border-line bg-sunken p-1`}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-[4px] px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink has-checked:bg-surface has-checked:text-ink has-checked:shadow-hairline has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-primary"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
