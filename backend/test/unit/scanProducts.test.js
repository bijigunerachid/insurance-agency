import { describe, expect, it } from 'vitest';
import {
  insurerUsageFor,
  insurerUsagesFor,
  productFits,
  ruleProduct,
  sheetKind,
  usageProductName,
} from '../../src/modules/scans/products.js';

// The agency's products (owner, 23/10/2026), as the catalogue groups them.
const products = [
  ['CAR', 'Véhicules de tourisme'],
  ['TAXI', 'Petit taxi'],
  ['TAXI', 'Grand taxi'],
  ['COMMERCIAL', 'Véhicules utilitaires'],
  ['COMMERCIAL', 'Camions et poids lourds'],
  ['FLEET', 'Flottes automobiles'],
  ['CAR', 'Assurance provisoire'],
  ['MOTORCYCLE', 'Motos'],
  ['MOTORCYCLE', 'Scooters'],
  ['MOTORCYCLE', 'Autres deux-roues'],
  ['TRIPORTEUR', 'Trois-roues et triporteurs'],
  ['COMMERCIAL', 'Transport de marchandises'],
  ['PASSENGER_TRANSPORT', 'Transport scolaire'],
  ['DRIVING_SCHOOL', 'Auto-écoles'],
  ['BORDER', 'Assurance aux frontières'],
].map(([line, name]) => ({ id: name, line, name }));
const fitting = (sheet) =>
  products.filter((product) => productFits(product, sheet)).map((product) => product.name);

describe('products that fit a scanned attestation', () => {
  it('follows the attestation model and the number of wheels', () => {
    expect(fitting({ modelCode: 'E', bodyType: '2.R' })).toEqual([
      'Motos',
      'Scooters',
      'Autres deux-roues',
    ]);
    expect(fitting({ modelCode: 'E', bodyType: '3.R' })).toEqual(['Trois-roues et triporteurs']);
    expect(fitting({ modelCode: 'E' })).toHaveLength(4);
    expect(fitting({ modelCode: 'B' })).toEqual([
      'Petit taxi',
      'Grand taxi',
      'Flottes automobiles',
      'Transport scolaire',
    ]);
    expect(fitting({ modelCode: 'C' })).toEqual([
      'Véhicules utilitaires',
      'Camions et poids lourds',
      'Flottes automobiles',
      'Transport de marchandises',
    ]);
  });

  it('keeps the provisional product for provisional series only', () => {
    expect(fitting({ modelCode: 'P', provisional: true })).toEqual(['Assurance provisoire']);
    expect(fitting({ modelCode: 'A' })).not.toContain('Assurance provisoire');
  });

  it('says nothing for a model that does not tell the product (D, G)', () => {
    expect(productFits(products[0], { modelCode: 'D' })).toBeNull();
    expect(fitting({ modelCode: 'G' })).toEqual([]);
  });

  it('offers border insurance on a model F sheet only, and nothing else there (rule C5)', () => {
    const border = products.find((p) => p.line === 'BORDER');
    expect(fitting({ modelCode: 'F' })).toEqual(['Assurance aux frontières']);
    for (const modelCode of ['A', 'B', 'C', 'D', 'E', 'G']) {
      expect(productFits(border, { modelCode })).toBe(false);
    }
    expect(productFits(border, { modelCode: 'P', provisional: true })).toBe(false);
    expect(ruleProduct(products, { modelCode: 'F' })).toBe(border);
  });

  it('proposes a product only when the sheet points to one', () => {
    expect(ruleProduct(products, { modelCode: 'E', bodyType: '3.R' })?.name).toBe(
      'Trois-roues et triporteurs',
    );
    expect(ruleProduct(products, { modelCode: 'P', provisional: true })?.name).toBe(
      'Assurance provisoire',
    );
    expect(ruleProduct(products, { modelCode: 'A', usage: 'TOURISME' })?.name).toBe(
      'Véhicules de tourisme',
    );
    // Scooter, moto or other, with no usage the owner confirmed: the agency's own choice decides.
    expect(ruleProduct(products, { modelCode: 'E', bodyType: '2.R' })).toBeNull();
    expect(
      ruleProduct(products, {
        modelCode: 'E',
        bodyType: '2.R',
        usage: 'CYLINDRÉE ENTRE 50 CM3 ET 125 CM3',
      }),
    ).toBeNull();
    expect(ruleProduct(products, { modelCode: 'A' })).toBeNull();
    expect(ruleProduct(products, { modelCode: 'D', usage: 'TOURISME' })).toBeNull();
  });

  it('proposes the product of the RMA usages the owner confirmed, when it fits the model', () => {
    const named = (sheet) => ruleProduct(products, sheet)?.name ?? null;
    // The platform PDF prints the moped usage cut short and letter-spaced.
    expect(named({ modelCode: 'E', bodyType: '2.R', usage: 'CY LINDRÉE < 50 CM3 VITESSE' })).toBe(
      'Scooters',
    );
    expect(named({ modelCode: 'E', usage: 'MOTOCYCLETTE SANS SIDE-CAR CYLINDRÉE > 125 CM3' })).toBe(
      'Motos',
    );
    expect(named({ modelCode: 'C', usage: 'C1 (COMMERCE <= 3,5T)' })).toBe('Véhicules utilitaires');
    expect(named({ modelCode: 'C', usage: 'COMMERCE <= 3,5T' })).toBe('Véhicules utilitaires');
    expect(named({ modelCode: 'C', usage: 'C2 (COMMERCE +3,5T)' })).toBe('Camions et poids lourds');
    // A usage that does not fit the model, or one left to the agency, proposes nothing.
    expect(named({ modelCode: 'C', usage: 'TOURISME' })).toBeNull();
    expect(named({ modelCode: 'A', usage: 'C1 (COMMERCE <= 3,5T)' })).toBeNull();
    expect(named({ modelCode: 'C', usage: 'C12' })).toBeNull();
    expect(named({ modelCode: 'D', usage: 'BALAYEUSE <= 3,5T' })).toBeNull();
    // A driving school is printed on a model D sheet: its usage alone
    // names the product, as printed by the platform.
    expect(named({ modelCode: 'D', usage: 'AUTO - ECOL E TOURISME' })).toBe('Auto-écoles');
    expect(named({ modelCode: 'D', bodyType: '2.R', usage: 'AUTO - ECOL E 2 OU 3 ROUES' })).toBe(
      'Auto-écoles',
    );
    // An electric moped on a white D sheet keeps its moped usage: a scooter (owner, 29/10/2026).
    expect(named({ modelCode: 'D', bodyType: '2.R', usage: 'CYLINDRÉE < 50 CM3 VITESSE' })).toBe(
      'Scooters',
    );
    // Other usages still need a model that fits.
    expect(named({ modelCode: 'A', usage: 'AUTO-ECOLE TOURISME' })).toBeNull();
    expect(named({ modelCode: 'A', usage: 'CYLINDRÉE < 50 CM3 VITESSE' })).toBeNull();
  });
});

describe('the product a printed usage points to', () => {
  it('reads the confirmed RMA usages only', () => {
    expect(usageProductName('Tourisme')).toBe('vehicules de tourisme');
    expect(usageProductName('CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H')).toBe('scooters');
    expect(usageProductName('LOCATION C.I.')).toBeNull();
    expect(usageProductName('TRANSPORT PERSONNEL <= 3,5T')).toBeNull();
    expect(usageProductName('AUTO-ECOLE TOURISME')).toBe('auto-ecoles');
    expect(usageProductName('AUTO-ECOLE UTIL./AUTOCARS')).toBe('auto-ecoles');
    expect(usageProductName('')).toBeNull();
    expect(usageProductName(undefined)).toBeNull();
  });
});

describe('the kind of printed sheet', () => {
  it('ignores spaces, accents and case, and needs a series', () => {
    const sheet = {
      insurerCode: 'RMA',
      seriesCode: '14 E',
      bodyType: '2.R',
      usage: 'CY LINDRÉE < 50 CM3 VITESSE',
    };
    expect(sheetKind(sheet)).toBe('RMA|14E|2.R|CYLINDREE<50CM3VITESSE');
    expect(sheetKind({ ...sheet, usage: 'Cylindree < 50 cm3 vitesse' })).toBe(sheetKind(sheet));
    expect(sheetKind({ ...sheet, bodyType: '3.R' })).not.toBe(sheetKind(sheet));
    expect(sheetKind({ insurerCode: 'RMA' })).toBeNull();
    expect(sheetKind(null)).toBeNull();
  });
});

describe('the RMA GAMA usage a printed usage names', () => {
  const gama = [
    'LOCATION C.I.',
    'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H',
    'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H',
    'TRANSPORT PERSONNEL <= 3,5T',
    'TRANSPORT PERSONNEL +3,5T',
    'TOURISME',
    'AUTO-ECOLE TOURISME',
    'C1 (COMMERCE <= 3,5T)',
  ].map((label, i) => ({ id: `u${i}`, label }));
  const named = (printed) => insurerUsageFor(gama, printed)?.label ?? null;

  it('is found whatever the spaces and accents of the PDF', () => {
    expect(named('C1 ( COMMERCE <= 3,5T)')).toBe('C1 (COMMERCE <= 3,5T)');
    expect(named('CYLINDREE < 50 CM3 VITESSE < 60 KM/H')).toBe(
      'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H',
    );
    expect(named('TOURISME')).toBe('TOURISME');
    expect(named('LOCATION C. I.')).toBe('LOCATION C.I.');
  });

  it('is found from a label cut short only when one label starts with it', () => {
    expect(named('TRANSPORT PERSONNEL <= 3')).toBe('TRANSPORT PERSONNEL <= 3,5T');
    expect(named('TRANSPORT PERSONNEL')).toBeNull();
    expect(named('CYLINDREE < 50 CM3')).toBeNull();
    expect(named('Provisoire')).toBeNull();
    expect(named('')).toBeNull();
  });

  it('lists every label a usage cut short may be, to offer only those', () => {
    const offered = (printed) => insurerUsagesFor(gama, printed).map((u) => u.label);
    // « CYLINDRÉE < 50 CM3 VITESSE » on the electric moped's sheet (owner, 29/10/2026).
    expect(offered('CYLINDRÉE < 50 CM3 VITESSE')).toEqual([
      'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H',
      'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H',
    ]);
    expect(offered('TRANSPORT PERSONNEL')).toHaveLength(2);
    // A whole label is that one only, even when another label starts with it.
    expect(offered('TOURISME')).toEqual(['TOURISME']);
    expect(offered('Provisoire')).toEqual([]);
    expect(offered('')).toEqual([]);
  });
});
