import { useState } from 'react';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { InsurerUsagesSection } from '../../features/catalogue/InsurerUsagesSection.jsx';
import { InsurersSection } from '../../features/catalogue/InsurersSection.jsx';
import { ModelsSection } from '../../features/catalogue/ModelsSection.jsx';
import { ProductsSection } from '../../features/catalogue/ProductsSection.jsx';
import { SeriesSection } from '../../features/catalogue/SeriesSection.jsx';
import { UsagesSection } from '../../features/catalogue/UsagesSection.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';

const t = fr.catalogue;

/** Products, attestation models, vehicle usages, attestation series and insurers. */
export function CataloguePage() {
  const { can } = useAuth();
  const canManage = can('catalogue.manage');
  const insurers = useApiQuery('/insurers');
  const models = useApiQuery('/attestation-models');
  const usages = useApiQuery('/vehicle-usages');
  const insurerUsages = useApiQuery('/insurer-usages');
  const [modelChanges, setModelChanges] = useState(0);
  const insurerItems = insurers.state.status === 'done' ? insurers.state.data.items : [];
  const modelItems = models.state.status === 'done' ? models.state.data.items : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>
      {insurers.state.status === 'done' && (
        <ProductsSection insurers={insurerItems} canManage={canManage} />
      )}
      <ModelsSection
        models={models.state}
        canManage={canManage}
        onChanged={() => {
          // Usages and series show their model.
          models.reload({ silent: true });
          usages.reload({ silent: true });
          setModelChanges((n) => n + 1);
        }}
      />
      <UsagesSection
        usages={usages.state}
        models={modelItems}
        canManage={canManage}
        onChanged={() => usages.reload({ silent: true })}
      />
      <InsurerUsagesSection insurerUsages={insurerUsages.state} />
      <SeriesSection
        insurers={insurerItems}
        models={modelItems}
        modelChanges={modelChanges}
        canManage={canManage}
      />
      <InsurersSection
        insurers={insurers.state}
        canManage={canManage}
        onChanged={() => insurers.reload({ silent: true })}
      />
    </div>
  );
}
