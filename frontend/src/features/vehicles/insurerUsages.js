/**
 * The insurers' own usages (RMA GAMA list) under their platform headings, offered when the legal
 * usage they belong to can be chosen; the vehicle's current one stays listed. With `only`, just
 * those usages (the ones a label cut short on the sheet may be).
 */
export function insurerUsageOptions(items, usageOptions, currentId, only = null) {
  const usable = new Set(usageOptions.map((o) => o.value));
  return items
    .filter((u) => (u.active && usable.has(u.usage.id)) || u.id === currentId)
    .filter((u) => !only || only.includes(u.id) || u.id === currentId)
    .map((u) => ({ value: u.id, label: u.label, group: `${u.insurer.code} · ${u.group}` }));
}

/**
 * True when an electric two- or three-wheeler keeps its moped usage (model E) on the usage Divers
 * (model D), as RMA issues it. Same rule as the server.
 */
function keptOnDivers(insurerUsage, usageModelCode, fuel) {
  return fuel === 'ELECTRIC' && insurerUsage.usage.modelCode === 'E' && usageModelCode === 'D';
}

/** True when the insurer's usage may stay on a vehicle of this legal usage and fuel. */
export function insurerUsageFits(insurerUsage, usage, fuel) {
  if (!usage) return false;
  return insurerUsage.usage.id === usage.id || keptOnDivers(insurerUsage, usage.modelCode, fuel);
}

/** The legal usage a vehicle gets when this insurer's usage is chosen: its own, or the one kept. */
export function legalUsageFor(insurerUsage, usage, fuel) {
  return usage && keptOnDivers(insurerUsage, usage.modelCode, fuel)
    ? usage.id
    : insurerUsage.usage.id;
}
