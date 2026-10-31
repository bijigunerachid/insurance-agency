import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../prisma/migrations/', import.meta.url);
const BLOCK = /-- reference-data:begin\r?\n([\s\S]*?)-- reference-data:end/;
let referenceSql;

/**
 * The "reference-data" block of the latest migration that has one (insurers, attestation models,
 * usages, series, rules register). Each block holds the complete reference rows for the schema
 * of its migration. Test resets empty the tables, then run it to restore exactly what a
 * deployment seeds.
 */
export function referenceData() {
  if (!referenceSql) {
    const blocks = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((name) => BLOCK.exec(readFileSync(new URL(`${name}/migration.sql`, MIGRATIONS), 'utf8')))
      .filter(Boolean);
    if (blocks.length === 0) throw new Error('no reference-data block in the migrations');
    referenceSql = blocks.at(-1)[1];
  }
  return referenceSql;
}

/** Every table a test reset empties, children first. */
export const RESET_TABLES = [
  'payment',
  'renewal_event',
  'renewal',
  'attestation_form_movement',
  'attestation_form',
  'attestation_batch',
  'attestation',
  'contract_status_change',
  'contract_vehicle',
  'contract',
  'rule_review',
  'insurer_rule',
  'product',
  'attestation_series',
  'insurer_usage',
  'vehicle_usage',
  'attestation_model',
  'insurer',
  'vehicle',
  'fleet',
  'customer',
  'counter',
  'session',
  'audit_log',
  'app_user',
];

export const resetSql = () =>
  `TRUNCATE ${RESET_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;\n${referenceData()}`;
