import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { MapIcon } from '@heroicons/react/24/outline';
import { ButtonLink } from '../components/Button.jsx';
import { fr } from '../i18n/fr.js';

/** An address that leads nowhere (or to a page this role may not open): the way home. */
export function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-sunken">
        <MapIcon aria-hidden="true" className="size-6 text-ink-muted" />
      </span>
      <h1 id="not-found-title" className="text-page text-ink">
        {fr.notFound.title}
      </h1>
      <ButtonLink to="/" icon={ArrowLeftIcon}>
        {fr.notFound.back}
      </ButtonLink>
    </section>
  );
}
