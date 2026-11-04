/**
 * Who belongs to one insurer's workspace (owner, 04/11/2026). A client or a vehicle is in a
 * workspace when it has at least one contract with that insurer, whatever its status; one with
 * no contract at all is in every workspace, so a new client is never lost before the first
 * contract. A client with both insurers is in both. A view filter, not an access rule.
 */
export const customerInWorkspace = (insurerId) => ({
  OR: [{ contracts: { some: { insurerId } } }, { contracts: { none: {} } }],
});

export const vehicleInWorkspace = (insurerId) => ({
  OR: [{ contracts: { some: { contract: { insurerId } } } }, { contracts: { none: {} } }],
});
