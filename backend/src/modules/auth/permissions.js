// Permission codes checked by the API. Roles grant them through the role_permission table
// (seeded by migrations). A route without a permission check must be explicitly public.
export const PERMISSIONS = Object.freeze({
  SYSTEM_HEALTH: 'system.health',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  AUDIT_READ: 'audit.read',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_ASSIGN: 'customers.assign',
  CUSTOMERS_ARCHIVE: 'customers.archive',
  /** Sees full identity numbers of every customer. */
  CUSTOMERS_IDENTITY: 'customers.identity',
  /** May reveal an identity number on request, with a reason that is audited. */
  CUSTOMERS_REVEAL: 'customers.reveal',
  VEHICLES_READ: 'vehicles.read',
  /** Create and edit vehicles and fleets. */
  VEHICLES_WRITE: 'vehicles.write',
  VEHICLES_ARCHIVE: 'vehicles.archive',
  CATALOGUE_READ: 'catalogue.read',
  /** Insurers, usages, attestation series, products and rules: create, edit, confirm, review. */
  CATALOGUE_MANAGE: 'catalogue.manage',
  CONTRACTS_READ: 'contracts.read',
  /** Create and edit drafts, send to the insurer, record the issue and attestations, cancel a draft. */
  CONTRACTS_WRITE: 'contracts.write',
  /** Suspend, reinstate or terminate an issued contract (insurer decision). */
  CONTRACTS_TERMINATE: 'contracts.terminate',
  STOCK_READ: 'stock.read',
  /** Receive batches of blank attestations, assign, return, declare damaged or lost forms. */
  STOCK_MANAGE: 'stock.manage',
  RENEWALS_READ: 'renewals.read',
  /** Follow a renewal: status, notes, prepare the new contract. */
  RENEWALS_WRITE: 'renewals.write',
  /** Give a renewal to another employee. */
  RENEWALS_ASSIGN: 'renewals.assign',
  PAYMENTS_READ: 'payments.read',
  /** Record a payment received at the agency and print its receipt. */
  PAYMENTS_RECORD: 'payments.record',
  /** Reverse a payment (management only, with a reason). */
  PAYMENTS_REVERSE: 'payments.reverse',
  REMITTANCES_READ: 'remittances.read',
  /** Record a remittance to an insurer, or cancel one recorded by mistake (management). */
  REMITTANCES_MANAGE: 'remittances.manage',
  /** See which documents a contract has (name, type, date). */
  DOCUMENTS_READ: 'documents.read',
  /** Open a document's file (personal data: every opening is audited). */
  DOCUMENTS_DOWNLOAD: 'documents.download',
  /** Attach a scan of an insurer's document to a contract, or a clearer scan in its place. */
  DOCUMENTS_UPLOAD: 'documents.upload',
  /** Remove a document attached by mistake (management, with a reason). */
  DOCUMENTS_REMOVE: 'documents.remove',
  /** Type what a document prints; with contracts.write, correct the issued contract from it. */
  DOCUMENTS_CAPTURE: 'documents.capture',
  /** See the agency's reports on screen. */
  /** Scan an attestation, check what was read and file it (customer, vehicle, contract). */
  SCANS_MANAGE: 'scans.manage',
  REPORTS_READ: 'reports.read',
  /** Export a report as CSV or Excel (management, after a recent re-authentication). */
  REPORTS_EXPORT: 'reports.export',
  /** See the état de production of the contracts one recorded (owner, 05/11/2026). */
  PRODUCTION_READ: 'production.read',
  /** See every employee's production, or one chosen employee's. */
  PRODUCTION_ALL: 'production.all',
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));
