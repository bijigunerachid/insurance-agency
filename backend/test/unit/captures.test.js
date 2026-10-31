import { describe, expect, it } from 'vitest';
import { compareCapture } from '../../src/modules/documents/compare.js';
import { captureFieldsSchema } from '../../src/modules/documents/fields.js';

const auth = (permissions = [], userId = 'u-agent') => ({
  user: { id: userId },
  permissions: new Set(permissions),
});
const contract = (overrides = {}) => ({
  id: 'c1',
  policyNumber: 'POL-0001',
  startDate: new Date('2026-11-01'),
  endDate: new Date('2027-10-31'),
  premiumTotal: { toFixed: () => '1234.50' },
  customer: {
    id: 'cu1',
    type: 'INDIVIDUAL',
    firstName: 'Saïda',
    lastName: 'El Amrani',
    identityNumber: 'AB123456',
    assignedUserId: null,
  },
  vehicles: [
    {
      vehicle: {
        id: 'v1',
        registration: '12345-A-6',
        registrationKey: '12345A6',
        vin: null,
        seats: 5,
        usage: { label: 'Tourisme' },
      },
    },
  ],
  attestations: [],
  ...overrides,
});
const byField = (checks) => Object.fromEntries(checks.map((c) => [c.field, c]));

describe('capture fields', () => {
  it('tidies what is typed: series, serial number, amounts in MAD', () => {
    expect(
      captureFieldsSchema('ATTESTATION').parse({ seriesCode: '91e', number: '123 456 789' }),
    ).toEqual({ seriesCode: '91 E', number: '123456789' });
    expect(
      captureFieldsSchema('CONDITIONS_PARTICULIERES').parse({ premiumTotal: '1 300,5', crm: ' ' }),
    ).toEqual({ premiumTotal: '1300.50' });
  });

  it('refuses a field of another document and an end before the start', () => {
    expect(captureFieldsSchema('QUITTANCE').safeParse({ seriesCode: '14 A' }).success).toBe(false);
    const result = captureFieldsSchema('NOTE_DE_COUVERTURE').safeParse({
      validFrom: '2026-11-02',
      validTo: '2026-11-01',
    });
    expect(result.error.issues[0]).toMatchObject({
      path: ['validTo'],
      message: 'END_BEFORE_START',
    });
  });
});

describe('comparison with the records', () => {
  it('matches a name printed in another order and without accents', () => {
    const checks = compareCapture({
      type: 'ATTESTATION',
      fields: { holderName: 'EL AMRANI SAIDA' },
      contract: contract(),
      auth: auth(),
    });
    expect(byField(checks).holderName.status).toBe('MATCH');
  });

  it('never shows the full identity number to someone who may not see it', () => {
    const fields = { holderIdNumber: 'ab 123456' };
    const hidden = byField(
      compareCapture({ type: 'ATTESTATION', fields, contract: contract(), auth: auth() }),
    ).holderIdNumber;
    expect(hidden).toMatchObject({ status: 'MATCH', recorded: 'AB****56' });
    const shown = byField(
      compareCapture({
        type: 'ATTESTATION',
        fields,
        contract: contract(),
        auth: auth(['customers.identity']),
      }),
    ).holderIdNumber;
    expect(shown.recorded).toBe('AB123456');
  });

  it('finds the vehicle by its plate whatever the separators, and says when it is not covered', () => {
    const covered = byField(
      compareCapture({
        type: 'NOTE_DE_COUVERTURE',
        fields: { registration: '12345 a 6' },
        contract: contract(),
        auth: auth(),
      }),
    );
    expect(covered.registration).toMatchObject({ status: 'MATCH', link: { kind: 'vehicle' } });
    const other = byField(
      compareCapture({
        type: 'NOTE_DE_COUVERTURE',
        fields: { registration: '777-B-1' },
        contract: contract(),
        auth: auth(),
      }),
    );
    expect(other.registration).toMatchObject({ status: 'NOT_ON_CONTRACT', recorded: '12345-A-6' });
  });

  it('offers the contract value to correct only for the fields a document proves', () => {
    const checks = byField(
      compareCapture({
        type: 'QUITTANCE',
        fields: { premiumTotal: '1300.00', periodFrom: '2026-11-01', quittanceNumber: 'Q-1' },
        contract: contract({ policyNumber: null }),
        auth: auth(),
      }),
    );
    expect(checks.premiumTotal).toMatchObject({ status: 'DIFFERENT', apply: 'premiumTotal' });
    expect(checks.periodFrom).toMatchObject({ status: 'MATCH', apply: 'startDate' });
    // The quittance number is kept, not compared: the app has no such field.
    expect(checks.quittanceNumber).toBeUndefined();
  });
});
