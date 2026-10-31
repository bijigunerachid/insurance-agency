import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCatSheet, parseCatSheet } from '../../src/modules/scans/cat.js';
import { isPlatformSheet, isProvisionalSheet } from '../../src/modules/scans/platform.js';
import { readPdfText } from '../../src/services/pdfText.js';

// Synthetic sheets (test/fixtures/make-platform-sheet.mjs): CAT and RMA laid out like
// their platforms' PDFs.
const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

describe('the PDF of the CAT platform', () => {
  it('reads every value exactly: the series from the usage, the guarantees, the totals', async () => {
    const text = await readPdfText(fixture('platform-cat-synthetique.pdf'));
    expect(isCatSheet(text)).toBe(true);
    // Never taken for an RMA sheet.
    expect(isPlatformSheet(text)).toBe(false);
    expect(isProvisionalSheet(text)).toBe(false);
    expect(parseCatSheet(text)).toEqual({
      insurerCode: 'CAT',
      intermediary: 'AGENCE ESSAI',
      intermediaryCode: '99999',
      policyNumber: 'C2026/000111',
      number: '165000111',
      // Printed on the paper, not in the PDF: « CAR DE LIGNE » is a passenger transport, model B.
      seriesCode: '91 B',
      effectDate: '2026-11-01',
      endDate: '2027-10-31',
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
      // The propriétaire, printed after the souscripteur.
      holderName: 'TRANSPORTS ESSAI SARL',
      holderIdNumber: 'ZZ999111',
      holderAddress: '1 RUE DE L ESSAI KENITRA',
      usage: 'CAR DE LIGNE',
      bodyType: 'C.I',
      registration: '99999-B-6',
      makeAndType: 'MERCEDES CAR',
      vin: 'WDB9999999',
      fiscalPowerCv: 24,
      firstRegistrationDate: '2015-01-01',
      trailer: 'NON',
      // « CINQUANTE + CHAUFFEUR ».
      seats: 50,
      fuel: 'DIESEL',
      crm: '1',
      // The rows with an amount or a premium, in the form's order; the franchise as a rate.
      guarantees: [
        { label: 'Responsabilité civile', premium: '8000.00' },
        { label: 'Incendie', details: '500 000', premium: '1500.00' },
        { label: 'Vol', details: '500 000 · franchise 5 %', premium: '600.00' },
        { label: 'Bris de glace', details: '30 000 · franchise 10 %', premium: '900.00' },
        { label: 'Événement catastrophique (RC)', premium: '150.25' },
        { label: 'Événement catastrophique (GA)', premium: '50.75' },
      ],
      premiumNet: '11201.00',
      fsec: '112.01',
      taxes: '1680.15',
      cnpac: '17.00',
      totalTtc: '13010.16',
      premiumTotal: '13010.16',
      issuedAt: 'KENITRA',
      issuedOn: '2026-10-20',
    });
  });

  it('leaves the series to the employee for a usage it does not know', async () => {
    const text = await readPdfText(fixture('platform-cat-synthetique.pdf'));
    const usage = text.left.find((row) => row.text.startsWith('CAR DE LIGNE'));
    usage.parts[0].text = 'TOURISME';
    const read = parseCatSheet(text);
    expect(read.usage).toBe('TOURISME');
    expect(read).not.toHaveProperty('seriesCode');
    expect(read.insurerCode).toBe('CAT');
  });

  it('never takes an RMA sheet for a CAT one', async () => {
    for (const name of [
      'platform-synthetique.pdf',
      'platform-avenant-synthetique.pdf',
      'platform-provisoire-synthetique.pdf',
    ]) {
      expect(isCatSheet(await readPdfText(fixture(name)))).toBe(false);
    }
    expect(isCatSheet(null)).toBe(false);
  });
});
