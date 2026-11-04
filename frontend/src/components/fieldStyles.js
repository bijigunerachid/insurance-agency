/**
 * The look shared by every form field (text, select, text area), so a form reads as one piece.
 * On a phone the text is 16 px (the phone does not zoom into the field) and the field 40 px high.
 */
export const fieldLabel = 'block text-label text-ink-soft';
export const fieldControl = (error) =>
  `mt-1.5 block w-full rounded-control border bg-surface px-3 text-base text-ink shadow-hairline transition-colors duration-150 placeholder:text-ink-muted focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted sm:text-sm ${
    error ? 'border-danger' : 'border-line-strong/70 hover:border-line-strong'
  }`;
export const fieldHeight = 'h-10 sm:h-9';
export const fieldHint = 'mt-1.5 text-xs text-ink-muted';
export const fieldError = 'mt-1.5 text-[13px] font-medium text-danger-ink';
export const fieldOptional = 'font-normal text-ink-muted';
