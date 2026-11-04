/**
 * A form's buttons, kept in reach at the bottom of the screen (above the phone menu) however
 * long the form; `hint` says what saving will do, at the left.
 */
export function FormActions({ hint, children }) {
  return (
    <div className="sticky bottom-[4.75rem] z-20 flex flex-wrap items-center justify-end gap-2 rounded-card border border-line bg-surface/95 p-3 shadow-raised backdrop-blur md:bottom-3">
      {hint && <p className="mr-auto text-sm text-ink-muted">{hint}</p>}
      {children}
    </div>
  );
}
