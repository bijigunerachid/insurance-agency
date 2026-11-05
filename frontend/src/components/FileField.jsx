import { ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useId, useState } from 'react';
import { fr } from '../i18n/fr.js';

const t = fr.fileField;
export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Why a file cannot be sent, or null. Checked in the browser first; the server checks again. */
export function fileProblem(file) {
  if (!file) return null;
  if (!ACCEPTED_TYPES.includes(file.type)) return fr.documents.wrongType;
  if (file.size > MAX_FILE_BYTES) return fr.documents.tooBig;
  return null;
}

/**
 * A scan to send: a wide zone to click, or to drop a file on from the computer. The real file
 * input covers the zone (invisible), so the keyboard, screen readers and the drop all use it.
 * `onChange(file, problem)`: the file when it can be sent, else null and the reason.
 * `capture` opens the phone's camera directly.
 */
export function FileField({ label, hint, file, error, onChange, disabled = false, capture }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const describedBy = [`${id}-hint`, file && `${id}-file`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');

  function choose(event) {
    setOver(false);
    const chosen = event.target.files?.[0] ?? null;
    const problem = fileProblem(chosen);
    onChange(problem ? null : chosen, problem);
  }

  return (
    <div>
      <label htmlFor={id} className="block text-label text-ink-soft">
        {label}
      </label>
      <div
        onDragEnter={() => setOver(true)}
        onDragLeave={() => setOver(false)}
        className={`relative mt-1.5 flex items-center gap-3 rounded-card border-2 border-dashed px-4 py-5 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${
          disabled
            ? 'border-line bg-sunken/60 opacity-70'
            : over
              ? 'border-primary bg-primary-soft'
              : error
                ? 'border-danger/50 bg-surface hover:bg-canvas'
                : 'border-line-strong/50 bg-surface hover:border-primary/60 hover:bg-canvas'
        }`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken">
          {file ? (
            <DocumentTextIcon aria-hidden="true" className="size-5 text-primary" />
          ) : (
            <ArrowUpTrayIcon aria-hidden="true" className="size-5 text-ink-muted" />
          )}
        </span>
        <span className="min-w-0 text-sm">
          {file ? (
            <span id={`${id}-file`} className="block">
              <span className="block break-all font-medium text-ink">{file.name}</span>
              <span className="block text-ink-muted">
                {fr.documents.size(file.size)} · {t.change}
              </span>
            </span>
          ) : (
            <span className="block">
              <span className="font-semibold text-primary">{t.choose}</span>{' '}
              <span className="hidden text-ink-muted sm:inline">{t.drop}</span>
            </span>
          )}
        </span>
        <input
          id={id}
          type="file"
          accept={ACCEPT}
          capture={capture}
          onChange={choose}
          onDrop={() => setOver(false)}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
