import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { AgencyMark } from '../features/agency/AgencyBrand.jsx';

/** Centered card used by the sign-in steps. */
export function AuthLayout({ title, intro, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <main className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <AgencyMark fallbackIcon={ShieldCheckIcon} size="lg" />
        </div>
        <section
          aria-labelledby="auth-title"
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h1 id="auth-title" className="text-xl font-semibold">
            {title}
          </h1>
          {intro && <p className="mt-2 text-sm text-slate-600">{intro}</p>}
          <div className="mt-5">{children}</div>
        </section>
        {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
      </main>
    </div>
  );
}
