import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useId } from 'react';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { fr } from '../../i18n/fr.js';

/**
 * The scan beside the values read or typed from it: a PDF in the browser's own viewer, a photo
 * fitted to the box, and a link to open it full size. `tall`: the scan check page, where it stays
 * in view (sticky) while the form beside it scrolls.
 */
export function ScanPreview({ url, mimeType, name, openLabel, tall = false }) {
  const headingId = useId();
  const height = tall ? 'h-[35vh] lg:h-[80vh]' : 'h-[50vh] lg:h-[70vh]';
  return (
    <section
      aria-labelledby={headingId}
      className={`overflow-hidden rounded-card border border-line bg-surface shadow-hairline ${
        tall ? 'lg:sticky lg:top-4 lg:self-start' : 'self-start'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id={headingId} className="text-section text-ink">
          {fr.capture.scan}
        </h2>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`${textLinkClasses} inline-flex items-center gap-1 text-sm`}
        >
          <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-4" />
          {openLabel}
        </a>
      </div>
      <div className="bg-sunken p-2">
        {mimeType === 'application/pdf' ? (
          <iframe
            src={url}
            title={name}
            className={`${height} w-full rounded-control bg-surface`}
          />
        ) : (
          <img
            src={url}
            alt={name}
            className={`${tall ? 'max-h-[35vh] lg:max-h-[80vh]' : 'max-h-[50vh] lg:max-h-[70vh]'} mx-auto w-full rounded-control object-contain`}
          />
        )}
      </div>
    </section>
  );
}
