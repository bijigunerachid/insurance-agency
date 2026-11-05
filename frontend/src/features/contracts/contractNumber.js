/**
 * The number a contract is known by in the agency: the insurer's policy number (owner,
 * 05/11/2026). A contract recorded before that rule may have none until it is issued: its
 * internal reference stands in.
 */
export function contractNumber(contract) {
  return contract?.policyNumber || contract?.ref || '';
}
