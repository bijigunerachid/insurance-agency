export function Spinner({ label }) {
  return (
    <div role="status" className="flex items-center gap-3 text-slate-600">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700 motion-reduce:animate-none"
      />
      <span>{label}</span>
    </div>
  );
}
