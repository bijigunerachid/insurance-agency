import { useId } from 'react';

/** Labelled multi-line input with hint and error text wired to aria-describedby. */
export function TextAreaField({ label, hint, error, className = '', rows = 4, ...props }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`mt-1 block w-full rounded-md border px-3 py-2 text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-0 focus:outline-blue-700 ${
          error ? 'border-red-500' : 'border-slate-300'
        }`}
        {...props}
      />
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
