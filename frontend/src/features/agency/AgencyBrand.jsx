import { createContext, useContext, useEffect, useState } from 'react';
import { fr } from '../../i18n/fr.js';
import { apiGet } from '../../services/api.js';

const NONE = { name: null, tagline: null, logo: false, icon: false };
const AgencyBrandContext = createContext(NONE);

/**
 * The agency using this installation (its settings, public before sign-in): read once, then
 * its name in the tab title and its icon in the tab. Until it answers, or if it cannot, the
 * application's own name is shown.
 */
export function AgencyBrandProvider({ children }) {
  const [brand, setBrand] = useState(NONE);
  useEffect(() => {
    let live = true;
    apiGet('/agency/brand')
      .then((value) => live && setBrand({ ...NONE, ...value }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    document.title = brand.name ? `${brand.name} · ${fr.app.name}` : fr.app.name;
    if (!brand.icon) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.append(link);
    }
    link.href = '/api/agency/icon';
  }, [brand]);
  return <AgencyBrandContext.Provider value={brand}>{children}</AgencyBrandContext.Provider>;
}

export const useAgencyBrand = () => useContext(AgencyBrandContext);

/** The agency's logo and name, or the application's mark when none is set. */
export function AgencyMark({ fallbackIcon: Icon, size = 'md' }) {
  const brand = useAgencyBrand();
  const height = { lg: 'h-20', md: 'h-9', sm: 'h-7' }[size];
  // In the phone header the logo leaves room for the search and the menus.
  const width = size === 'sm' ? 'max-w-[34vw]' : 'max-w-[45vw]';
  // A narrow phone header: the agency's square icon when there is one, rather than a cut logo.
  if (size === 'sm' && brand.icon) {
    return (
      <img
        src="/api/agency/icon"
        alt={brand.name ?? fr.app.name}
        className="size-8 shrink-0 rounded"
      />
    );
  }
  return (
    <>
      {brand.logo ? (
        // The logo carries the name: read as the agency's name by screen readers.
        <img
          src="/api/agency/logo"
          alt={brand.name ?? ''}
          className={`${height} w-auto ${width} object-contain object-left`}
        />
      ) : (
        <Icon
          aria-hidden="true"
          className={`${size === 'lg' ? 'size-9' : 'size-8'} text-primary`}
        />
      )}
      {!brand.logo && (
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{brand.name ?? fr.app.name}</p>
          <p className={`text-xs text-ink-muted ${size === 'lg' ? '' : 'hidden sm:block'}`}>
            {brand.tagline ?? fr.app.tagline}
          </p>
        </div>
      )}
    </>
  );
}
