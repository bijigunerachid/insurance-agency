import { useId } from 'react';

/**
 * A few choices of a form shown as pills, one chosen (how a payment or a remittance was made).
 * Real radio buttons under the look: the arrow keys move between them, screen readers say
 * « 1 sur 5 ». `onChange(value)`.
 */
export function ChoicePills({ label, value, options, onChange }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-label text-ink-soft">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${
              value === option.value
                ? 'bg-primary text-white ring-primary'
                : 'bg-surface text-ink ring-line-strong/60 hover:bg-sunken'
            }`}
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
