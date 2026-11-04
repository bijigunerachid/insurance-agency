import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef } from 'react';
import { fr } from '../i18n/fr.js';

/**
 * Modal dialog built on the native <dialog> element: the browser traps focus, closes on
 * Escape and restores focus afterwards. Rendered only while open.
 */
export function Dialog({ title, onClose, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog.showModal && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    // A field marked data-autofocus takes the focus (the browser would give it to « Fermer »).
    dialog.querySelector('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg animate-enter rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-section">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring -m-1 rounded-control p-1 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <XMarkIcon aria-hidden="true" className="size-5" />
          <span className="sr-only">{fr.common.close}</span>
        </button>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
