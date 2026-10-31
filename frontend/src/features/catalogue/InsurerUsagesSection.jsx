import { fr } from '../../i18n/fr.js';
import { CatalogueSection, QueryState } from './CatalogueSection.jsx';

const t = fr.catalogue.insurerUsages;

/** The insurers' own usages (RMA GAMA « Type d'usage »), under their platform headings. Read only. */
export function InsurerUsagesSection({ insurerUsages }) {
  return (
    <CatalogueSection id="insurer-usages-heading" title={t.title} intro={t.intro}>
      <QueryState
        state={insurerUsages}
        empty={t.empty}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <div className="divide-y divide-slate-200">
            {groupsOf(data.items).map(({ key, insurer, group, items }) => (
              <details key={key} className="px-4 py-2">
                <summary className="cursor-pointer py-1 text-sm font-medium">
                  {t.group(insurer, group, items.length)}
                </summary>
                <ul className="mt-1 space-y-2 pb-2">
                  {items.map((u) => (
                    <li key={u.id} className="text-sm">
                      <span className="font-medium break-words">{u.label}</span>
                      <span className="block text-xs text-slate-600">
                        {t.usage(u.usage.label, u.usage.modelCode)}
                        {u.vehicleCount > 0 && ` · ${t.vehicles(u.vehicleCount)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      />
    </CatalogueSection>
  );
}

/** Rows that follow each other under the same insurer and heading, as the platform lists them. */
function groupsOf(items) {
  const groups = [];
  for (const item of items) {
    const key = `${item.insurer.code}|${item.group}`;
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, insurer: item.insurer.code, group: item.group, items: [item] });
  }
  return groups;
}
