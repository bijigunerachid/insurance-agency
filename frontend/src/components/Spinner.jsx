export function Spinner({ label }) {
  return (
    <div role="status" className="flex items-center gap-2.5 text-sm text-ink-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
      />
      <span>{label}</span>
    </div>
  );
}
