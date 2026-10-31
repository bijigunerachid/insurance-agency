/**
 * A form's buttons, kept in reach at the bottom of the screen (above the phone menu) however
 * long the form; `hint` says what saving will do, at the left.
 */
export function FormActions({ hint, children }) {
  return (
    <div className="sticky bottom-[4.75rem] z-20 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-3">
      {hint && <p className="mr-auto text-sm text-slate-600">{hint}</p>}
      {children}
    </div>
  );
}
