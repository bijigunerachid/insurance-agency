import {
  ArrowRightIcon,
  ArrowRightStartOnRectangleIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { useId, useState } from 'react';
import { AgencyMark } from '../features/agency/AgencyBrand.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { BOTH, useWorkspace } from '../features/workspace/Workspace.jsx';
import { fr } from '../i18n/fr.js';

const t = fr.workspace;
/** An insurer without a colour in the settings: a neutral slate. */
const NEUTRAL = '#334155';

/**
 * After sign-in (owner, 04/11/2026): one large card per insurer of the catalogue, dressed from
 * the installation's settings (colour, logo, photo), and both insurers together.
 */
export function WorkspacePage() {
  const { me, logout } = useAuth();
  const { items, choose } = useWorkspace();

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AgencyMark fallbackIcon={ShieldCheckIcon} />
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          <ArrowRightStartOnRectangleIcon aria-hidden="true" className="size-5" />
          <span className="sr-only sm:not-sr-only">{fr.nav.logout}</span>
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 sm:pt-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
            {t.hello(me.user.displayName)}
          </h1>
          <p className="mt-2 text-base text-slate-600 sm:text-lg">{t.choose}</p>
        </div>

        <ul
          aria-label={t.cardsLabel}
          className={`mx-auto mt-8 grid gap-5 sm:mt-10 sm:gap-6 md:grid-cols-2 ${
            items.length > 2 ? 'lg:grid-cols-3' : 'max-w-5xl'
          }`}
        >
          {items.map((item) => (
            <li key={item.id}>
              <WorkspaceCard item={item} onChoose={() => choose(item.id)} />
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-2 text-center">
          <button
            type="button"
            onClick={() => choose(BOTH)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <Squares2X2Icon aria-hidden="true" className="size-5 text-slate-500" />
            {t.both}
          </button>
          <p className="text-xs text-slate-500">
            {t.bothHint} {t.shared}
          </p>
        </div>
      </main>
    </div>
  );
}

/** A large card that opens one insurer's workspace: the whole card is one button. */
function WorkspaceCard({ item, onChoose }) {
  const titleId = useId();
  const taglineId = useId();
  const ctaId = useId();
  // An image the server cannot send is left out (the card keeps its colour).
  const [photo, setPhoto] = useState(item.photo);
  const [logo, setLogo] = useState(item.logo);
  const colour = item.colour ?? NEUTRAL;

  return (
    <button
      type="button"
      onClick={onChoose}
      aria-labelledby={ctaId}
      aria-describedby={item.tagline ? `${titleId} ${taglineId}` : titleId}
      // A colour from the settings: a CSS variable, set through the DOM (allowed by the CSP).
      style={{ '--brand': colour }}
      className="group relative flex h-64 w-full flex-col justify-end overflow-hidden rounded-3xl bg-(--brand) text-left text-white shadow-lg ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-(--brand) motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:h-80 lg:h-[26rem]"
    >
      {photo ? (
        <img
          src={`/api/workspaces/${encodeURIComponent(item.code)}/photo`}
          alt=""
          onError={() => setPhoto(false)}
          className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <ShieldCheckIcon
          aria-hidden="true"
          className="absolute -right-10 -top-10 size-72 text-white/10 transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
        />
      )}
      {/* The insurer's colour over the photo, darker at the bottom where the text sits. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-(--brand) via-(--brand)/60 to-(--brand)/10"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-slate-950/60 to-transparent"
      />

      <span className="absolute left-5 top-5 sm:left-7 sm:top-7">
        {logo ? (
          <span className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-md">
            <img
              src={`/api/workspaces/${encodeURIComponent(item.code)}/logo`}
              alt=""
              onError={() => setLogo(false)}
              className="h-9 w-auto max-w-40 object-contain sm:h-11"
            />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex rounded-2xl bg-white/95 px-4 py-2.5 text-xl font-bold tracking-wide text-slate-900 shadow-md"
          >
            {item.code}
          </span>
        )}
      </span>

      <span className="relative block p-5 sm:p-7">
        <span
          id={titleId}
          className="block text-2xl font-semibold tracking-tight drop-shadow-sm sm:text-3xl"
        >
          {item.title}
        </span>
        {item.tagline && (
          <span id={taglineId} className="mt-1 block text-sm text-white/90 sm:text-base">
            {item.tagline}
          </span>
        )}
        <span className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 sm:mt-5">
          <span
            id={ctaId}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition group-hover:gap-3 motion-reduce:transition-none"
          >
            {t.enter(item.code)}
            <ArrowRightIcon aria-hidden="true" className="size-4 text-(--brand)" />
          </span>
          {/* The photo's author and licence (a CC BY licence asks for it), never hidden. */}
          {photo && item.photoCredit && (
            <span className="ml-auto max-w-full text-right text-[10px] leading-tight text-white/80">
              {t.photoCredit(item.photoCredit)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
