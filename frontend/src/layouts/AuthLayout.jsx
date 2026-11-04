import {
  ArrowPathIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { AgencyMark, useAgencyBrand } from '../features/agency/AgencyBrand.jsx';
import { LARGE_QUERY, useWideScreen } from '../hooks/useWideScreen.js';
import { fr } from '../i18n/fr.js';

const t = fr.authLayout;
// What the application does, as it is (no promise of a feature that does not exist).
const POINTS = [
  { Icon: DocumentTextIcon, text: t.points.contracts },
  { Icon: BanknotesIcon, text: t.points.payments },
  { Icon: ArrowPathIcon, text: t.points.renewals },
];

/**
 * The sign-in steps (sign-in, code, new password, second factor). On a computer: the agency on
 * a dark panel at the left, the step at the right. On a phone: the step alone, under the
 * agency's logo.
 */
export function AuthLayout({ title, intro, children, footer }) {
  const brand = useAgencyBrand();
  // One logo in the page: the panel's on a large screen, above the form otherwise.
  const panel = useWideScreen(LARGE_QUERY);
  return (
    <div className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)]">
      {panel && (
        <aside className="relative flex flex-col overflow-hidden bg-ink px-12 py-10 text-white">
          <div className="inline-flex w-fit items-center gap-3 rounded-card bg-white px-4 py-3 text-ink">
            <AgencyMark fallbackIcon={ShieldCheckIcon} />
          </div>
          <div className="my-auto max-w-md space-y-8 py-12">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/60">
                {brand.name ?? fr.app.name}
              </p>
              <p className="text-3xl font-semibold leading-tight tracking-tight">{t.headline}</p>
              <p className="text-base text-white/70">{brand.tagline ?? fr.app.tagline}</p>
            </div>
            <ul className="space-y-4">
              {POINTS.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-white/85">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-white/10">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-center gap-2 text-xs text-white/55">
            <WifiIcon aria-hidden="true" className="size-4" />
            {t.offline}
          </p>
        </aside>
      )}

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {!panel && (
            <div className="mb-8 flex items-center justify-center gap-3">
              <AgencyMark fallbackIcon={ShieldCheckIcon} size="lg" />
            </div>
          )}
          <section aria-labelledby="auth-title">
            <h1 id="auth-title" className="text-page text-ink">
              {title}
            </h1>
            {intro && <p className="mt-2 text-sm text-ink-muted">{intro}</p>}
            <div className="mt-8">{children}</div>
          </section>
          {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
