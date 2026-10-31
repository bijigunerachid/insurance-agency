import { describe, expect, it } from 'vitest';
import { parseAttestation } from '../../src/modules/scans/parse.js';

describe('values proposed from the text of a scan', () => {
  it('reads the series and number as the real forms were read (accent, spaces, box)', () => {
    // Readings of the blank forms supplied by the agency (22/10/2026).
    expect(parseAttestation("NUMERO D'ORDRE | 14 À 21 8362562")).toMatchObject({
      seriesCode: '14 A',
      number: '218362562',
    });
    expect(parseAttestation("NUMERO D'ORDRE 91E 181673387")).toMatchObject({
      seriesCode: '91 E',
      number: '181673387',
    });
    const cat = parseAttestation(
      "ATTESTATION PROVISOIRE\nNUMERO D'ORDRE| 91 P 4181871639\nCAT Assurance",
    );
    expect(cat).toMatchObject({ seriesCode: '91 P', usage: 'Provisoire', insurerCode: 'CAT' });
    expect(cat.numberCandidates).toContain('181871639');
  });

  it('takes a value after its label, never another label or the Arabic translation', () => {
    const fields = parseAttestation(
      [
        'Intermédiaire: Attestation:',
        'Numéro de la police 4012345678 | رقم البوليصة',
        'Marque et type RENAULT CLIO',
        'Nom',
      ].join('\n'),
    );
    expect(fields).toEqual({ policyNumber: '4012345678', makeAndType: 'RENAULT CLIO' });
  });

  it('reads the period of cover and ignores a date that does not exist', () => {
    expect(parseAttestation('DU: 01 11 2026\nAU: 31/10/2027')).toEqual({
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
    });
    expect(parseAttestation('DU: 31 02 2026')).toEqual({});
  });

  it('proposes no insurer when both names are read (a page holding two documents)', () => {
    expect(parseAttestation('RMA ... CAT Assurance').insurerCode).toBeUndefined();
  });
});
