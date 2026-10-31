import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isPlatformSheet,
  isProvisionalSheet,
  parsePlatformSheet,
  parseProvisionalSheet,
} from '../../src/modules/scans/platform.js';
import { collapseSpacing, readPdfText } from '../../src/services/pdfText.js';

// A synthetic sheet laid out like the RMA platform's PDF (test/fixtures/make-platform-sheet.mjs).
const sheet = readFileSync(new URL('../fixtures/platform-synthetique.pdf', import.meta.url));

describe('text of the platform PDF', () => {
  it('removes the spaces read inside words, keeps real word spaces', () => {
    // As the platform's PDF prints them: letter-spaced dates, the narrow capital I.
    expect(collapseSpacing('2 3 - 0 4 - 2 0 2 6')).toBe('23-04-2026');
    expect(collapseSpacing('3 5 RUE DE L ESSAI KEN I TRA')).toBe('3 5 RUE DE L ESSAI KENITRA');
    expect(collapseSpacing('M I RNI L')).toBe('MIRNIL');
    expect(collapseSpacing('AGENCE TEST I')).toBe('AGENCE TESTI');
    expect(collapseSpacing('DUREE FERME')).toBe('DUREE FERME');
  });

  it('reads every value of the sheet exactly, without recognising an image', async () => {
    const text = await readPdfText(sheet);
    expect(isPlatformSheet(text)).toBe(true);
    expect(parsePlatformSheet(text)).toEqual({
      insurerCode: 'RMA',
      newBusiness: true,
      seriesCode: '14 A',
      number: '999000222',
      policyNumber: '400000000000111',
      effectDate: '2026-11-01',
      endDate: '2027-11-01',
      validFrom: '2026-11-01',
      validTo: '2027-11-01',
      usage: 'TOURISME',
      quittanceNumber: '99999999999999999999',
      duration: 'DUREE FERME',
      premiumNet: '1300.00',
      taxes: '200.00',
      fees: '0.00',
      totalTtc: '1500.00',
      cnpac: '20.00',
      stamp: '0.00',
      premiumTotal: '1520.00',
      issuedOn: '2026-10-20',
      issuedAt: 'KENITRA',
      paymentMethod: 'CASH',
      fuel: 'DIESEL',
      firstRegistrationDate: '2020-03-15',
      fiscalPowerCv: 6,
      seats: 5,
      crm: '1.0',
      driverBirthDate: '1980-01-01',
      guarantees: [
        { label: 'Responsabilité civile', details: '50 000 000', premium: '1200.00' },
        { label: 'Défense et recours', details: 'Forfait 10.000.00' },
      ],
      formula: 'RC',
      holderName: 'TEST SYNTHETIQUE',
      holderIdNumber: 'ZZ999999',
      holderAddress: '1 RUE DE L ESSAI KENITRA',
      intermediary: 'AGENCE ESSAI A9999',
      registration: '99999-A-6',
      vin: 'VF1ABCDEF12345678',
      makeAndType: 'DACIA LOGAN',
      bodyType: 'VP',
      trailer: 'ZERO',
    });
  });

  it('says a scanned picture or another PDF is not a platform sheet', async () => {
    expect(await readPdfText(Buffer.from('%PDF-1.7\nnot really a pdf\n'))).toBeNull();
    expect(isPlatformSheet(null)).toBe(false);
    expect(isPlatformSheet({ left: [{ text: 'Bonjour', parts: [] }], right: [] })).toBe(false);
  });
});

describe('a provisional attestation printed by the platform', () => {
  // Laid out like RMA's provisional sheet (attestation half only), invented values.
  const provisional = readFileSync(
    new URL('../fixtures/platform-provisoire-synthetique.pdf', import.meta.url),
  );

  it('reads the attestation half, the series being the provisional one and the number typed', async () => {
    const text = await readPdfText(provisional);
    expect(isPlatformSheet(text)).toBe(false);
    expect(isProvisionalSheet(text)).toBe(true);
    const read = parseProvisionalSheet(text);
    expect(read).toMatchObject({
      insurerCode: 'RMA',
      provisional: true,
      seriesCode: '14 P',
      usage: 'TOURI SME',
      holderName: 'TEST PROVISOIRE',
      holderIdNumber: 'ZZ777777',
      holderAddress: '3 RUE DE L ESSAI KENITRA',
      policyNumber: '400000000000333',
      intermediary: 'AGENCE ESSAI A9999',
      registration: '77777 -B- 06',
      makeAndType: 'PEUGEOT',
      bodyType: 'CONDUITE INTERIEURE',
      trailer: 'ZERO',
      // The month is printed letter by letter: « Ju i l l e t », « Ao u t ».
      validFrom: '2025-07-15',
      validTo: '2025-08-15',
      issuedOn: '2026-10-29',
      issuedAt: 'KENITRA',
    });
    // Nothing the PDF does not print: no number, no premium.
    expect(read).not.toHaveProperty('number');
    expect(read).not.toHaveProperty('premiumTotal');
    // A full platform sheet is never taken for a provisional one.
    expect(isProvisionalSheet(await readPdfText(sheet))).toBe(false);
  });
});

describe('a vehicle-change avenant printed by the platform', () => {
  // Laid out like RMA's vehicle-change avenant, with invented values.
  const avenant = readFileSync(
    new URL('../fixtures/platform-avenant-synthetique.pdf', import.meta.url),
  );

  it('reads the avenant, its own amount, and the vehicle printed without a chassis', async () => {
    const text = await readPdfText(avenant);
    expect(isPlatformSheet(text)).toBe(true);
    expect(parsePlatformSheet(text)).toMatchObject({
      amendmentKind: 'VEHICLE_CHANGE',
      amendmentNumber: '2600000001',
      amendmentLabel: 'Avenant de changement de vehicule',
      seriesCode: '14 A',
      number: '999000333',
      policyNumber: '400000000000222',
      effectDate: '2026-06-27',
      endDate: '2027-03-21',
      validFrom: '2026-06-27',
      validTo: '2027-03-21',
      premiumTotal: '512.64',
      guarantees: [{ label: 'Responsabilité civile', details: '50 000 000', premium: '2350.40' }],
      registration: '88888 -A- 57',
      makeAndType: 'RENAULT',
      bodyType: 'C.I',
      trailer: 'ZERO',
      fuel: 'DIESEL',
      firstRegistrationDate: '2017-12-14',
      fiscalPowerCv: 6,
      seats: 5,
      crm: '0.9',
    });
    expect(parsePlatformSheet(text).vin).toBeUndefined();
  });

  it('keeps a renewal a renewal, and an unknown avenant for the employee to say', () => {
    const row = (...parts) => ({ text: parts.join(' '), parts: parts.map((text) => ({ text })) });
    const read = (title) => parsePlatformSheet({ left: [row(title, '2600000002')], right: [] });
    expect(read('AVENANT DE RENOUVELLEMENT N')).not.toHaveProperty('amendmentKind');
    expect(read('AVENANT DE CHANGEMENT D’IMMATRICULATION N')).toMatchObject({
      amendmentKind: 'REGISTRATION_CHANGE',
    });
    expect(read('AVENANT DE MODIFICATION DES GARANTIES N')).toMatchObject({
      amendmentKind: 'OTHER',
      amendmentNumber: '2600000002',
    });
  });
});

describe('a renewal printed by the platform', () => {
  it('is told apart from new business', () => {
    const row = (text) => ({ text, parts: [{ text }] });
    const sheet = { left: [row('RENOUVELLEMENT')], right: [] };
    expect(parsePlatformSheet(sheet)).toMatchObject({ newBusiness: false });
    expect(parsePlatformSheet({ left: [row('AFFAIRE NOUVELLE')], right: [] })).toMatchObject({
      newBusiness: true,
    });
  });
});

describe('a sheet with gaps read inside words (RMA platform PDF of 26/10/2026)', () => {
  // Rows as pdf.js reads them, with invented values: each piece where the PDF draws it.
  const row = (...parts) => ({
    text: parts.join(' '),
    parts: parts.map((text) => ({ text })),
  });
  const sheet = {
    left: [
      row('AVENANT DE RENOUVELLEMENT N', '2600000000'),
      row('400000000000111', 'A9 9 9 9', '1 4E', '200000001'),
      row('KI LI', 'TESTI', 'ZZ1 2 3 4'),
      row('8 0 HAY ESSAI KENITRA'),
      row('KI LI', 'TESTI', '22-02-1999'),
      row('FICE', 'XCB LN', 'VF1ABCDEF12345678', 'Essence'),
      row('Re s p o n s a b i l i t e', 'Civile', '50', '000', '000', '1.277.00'),
      row('Ev e n eme n t', 'Ca t a s t r o p h i q u e', '------', 'pour', '44.70'),
      row('KENITRA', '23-10-2026', 'Mode de r g l ement :Esp ce'),
    ],
    right: [
      row('78fa99e5-6154-42a5-9784-4257f2b32905'),
      row('KIL I TEST I'),
      row('ZZ1234'),
      row('80 HAY ESSAI KENITRA'),
      row('400000000000111'),
      row('ASSURANCE ESSAI', 'A9999'),
      row('VF1ABCDEF12345678'),
      row('VF1ABCDEF12345678'),
      row('F ICE XCBLN'),
      row('2 .R'),
    ],
  };

  it('skips the platform reference and keeps the holder in the right fields', () => {
    expect(parsePlatformSheet(sheet)).toMatchObject({
      newBusiness: false,
      holderName: 'KILI TESTI',
      holderIdNumber: 'ZZ1234',
      holderAddress: '80 HAY ESSAI KENITRA',
      makeAndType: 'FICE XCBLN',
    });
  });

  it('reads letter-spaced guarantees, a thousands dot and the payment line', () => {
    expect(parsePlatformSheet(sheet)).toMatchObject({
      guarantees: [
        { label: 'Responsabilité civile', details: '50 000 000', premium: '1277.00' },
        { label: 'Événement catastrophique', details: 'pour', premium: '44.70' },
      ],
      issuedOn: '2026-10-23',
      issuedAt: 'KENITRA',
      paymentMethod: 'CASH',
    });
  });

  it('reads the guarantees of a full cover printed without a premium, as printed', () => {
    // Laid out like the owner's motorcycle sheet of 29/10/2026 (full cover), invented values.
    const read = parsePlatformSheet({
      left: [
        row('400000000000555', 'A9 9 9 9', '1 4E', '200000005'),
        row('Re s p o n s a b i l i t e', 'Civile', '50', '000', '000', '2.216.00'),
        row(
          'Ev e n eme n t',
          'Ca t a s t r o p h i q u e',
          "pour l ' app l i cat i on de cet te garant i e, se référer à l a c l ause 14",
          '94.73',
        ),
        row(
          'Domma g e s',
          'Co l l i s i o n',
          'Va l e u r',
          'venale',
          '20.000.00',
          '5%M i n 1 0 0 0 / Va l',
          'Dom',
          'DC',
        ),
        row('Incendie', 'Va l e u r', 'venale', '80.000.00', '200', 'DH / Dom', 'elect', 'DC'),
        row('Vo l', 'Va l e u r', 'venale', '80.000.00', 'DC'),
        row('Dè f e n s e', 'et', 'Re c o u r s', 'Fo r f a i t', '10.000.00', 'DC'),
        row('As s i s t a n c e', 'RMASSIST', 'MOTO', 'ZEN', 'DC'),
        row(
          'Toutes',
          'les',
          'autres',
          'garanties',
          'non',
          'mentionnees',
          'ci-dessus',
          'sont',
          'exclues',
        ),
      ],
      right: [],
    });
    expect(read.guarantees).toEqual([
      { label: 'Responsabilité civile', details: '50 000 000', premium: '2216.00' },
      { label: 'Événement catastrophique', details: 'Voir la clause 14', premium: '94.73' },
      { label: 'Dommages collision', details: 'Valeur venale 20.000.00 5%Min1000/Val Dom' },
      { label: 'Incendie', details: 'Valeur venale 80.000.00 200 DH/Dom elect' },
      { label: 'Vol', details: 'Valeur venale 80.000.00' },
      { label: 'Défense et recours', details: 'Forfait 10.000.00' },
      { label: 'Assistance', details: 'RMASSIST MOTO ZEN' },
    ]);
    // « DC » ends every optional guarantee: the formula (owner, 29/10/2026: dommages collision).
    expect(read.formula).toBe('DC');
  });

  it('reads the formula printed after the optional guarantees, once', () => {
    const sheet = (...rows) =>
      parsePlatformSheet({
        left: [
          row('400000000000555', 'A9 9 9 9', '1 4A', '200000005'),
          row('Re s p o n s a b i l i t e', 'Civile', '50', '000', '000', '900.00'),
          row('Ev e n eme n t', 'Ca t a s t r o p h i q u e', 'clause 13', '30.00'),
          ...rows,
        ],
        right: [],
      });
    // As RMA prints them (utility van, lorry, auto-école), invented values.
    const boost = sheet(
      row('Dè f e n s e', 'et', 'Re c o u r s', 'Fo r f a i t', '10.000.00', 'BOOST', 'RC'),
      row('As s i s t a n c e', 'Optimale', 'BOOST', 'RC'),
    );
    expect(boost.formula).toBe('BOOST RC');
    expect(boost.guarantees.slice(2)).toEqual([
      { label: 'Défense et recours', details: 'Forfait 10.000.00' },
      { label: 'Assistance', details: 'Optimale' },
    ]);
    const lorry = sheet(
      row('Dè f e n s e', 'et', 'Re c o u r s', 'Fo r f a i t', '10.000.00', 'RC POIDS LOURDS'),
      row('As s i s t a n c e', 'F1', 'RC POIDS LOURDS'),
    );
    expect(lorry.formula).toBe('RC POIDS LOURDS');
    // One optional guarantee: only its last word, when it is RC or DC.
    const single = sheet(
      row('Dè f e n s e', 'et', 'Re c o u r s', 'Fo r f a i t', '10.000.00', 'RC'),
    );
    expect(single.formula).toBe('RC');
    expect(single.guarantees[2]).toEqual({
      label: 'Défense et recours',
      details: 'Forfait 10.000.00',
    });
    // Only the two compulsory guarantees, or words that are no formula: none, details untouched.
    expect(sheet().formula).toBeUndefined();
    const other = sheet(row('As s i s t a n c e', 'Basique'), row('Vo l', 'Valeur', 'Basique'));
    expect(other.formula).toBeUndefined();
    expect(other.guarantees[2]).toEqual({ label: 'Assistance', details: 'Basique' });
  });

  it('reads a utility vehicle: address on two lines, weight class under the body type', () => {
    // Laid out like RMA's utility-vehicle sheet (C1 usage, camionnette), invented values.
    const utility = {
      left: [
        row('AFFA IRE NOUVELLE'),
        row('400000000000222', 'A9 9 9 9', '1 4C', '200000002'),
        row('TATA', '-', '99999-A-13', 'Diesel'),
        row('10-12-2024'),
        row('6', 'CAMIONNET TE', 'P L ATEAU', '2'),
        row('ZERO', '1.0'),
      ],
      right: [
        row('TESTI ESSAI'),
        row('ZZ1234'),
        row('1 RUE ESSAI BLOC B'),
        row('HAY ESSAI CASABLANCA'),
        row('400000000000222'),
        row('ASSURANCE ESSAI', 'A9999'),
        row('99999 -A- 13'),
        row('TATA', '-'),
        row('CAMIONNETTE PLATEAU'),
        row('I n f e r i eu r', 'ou', 'ega l', 'a', '3T500'),
        row('ZERO'),
      ],
    };
    expect(parsePlatformSheet(utility)).toMatchObject({
      seriesCode: '14 C',
      holderAddress: '1 RUE ESSAI BLOC B HAY ESSAI CASABLANCA',
      registration: '99999 -A- 13',
      makeAndType: 'TATA',
      bodyType: 'CAMIONNETTE PLATEAU',
      trailer: 'ZERO',
      fiscalPowerCv: 6,
      seats: 2,
      crm: '1.0',
    });
  });

  it('reads the policy a new one replaces, never as its own policy', () => {
    // Laid out like the owner's driving-school sheet of 29/10/2026, invented values.
    const replacing = {
      left: [
        row('REMPLACEMENT DE POL ICE N', '400000000000998'),
        row('400000000000999', 'A9 9 9 9', '1 4D', '200000004'),
        row('YAMAX', 'PCN2 B', '99999-A-87', 'Essence'),
        row('16-03-2021'),
        row('3', '2.R', '2'),
        row('ZERO', '1.0'),
      ],
      right: [],
    };
    expect(parsePlatformSheet(replacing)).toMatchObject({
      replacesPolicy: '400000000000998',
      policyNumber: '400000000000999',
      newBusiness: false,
      seriesCode: '14 D',
    });
    const plain = parsePlatformSheet({ ...replacing, left: replacing.left.slice(1) });
    expect(plain).not.toHaveProperty('replacesPolicy');
  });

  it('reads a lorry: its weight is not the trailer, and a fiscal power of 0 is none', () => {
    // Laid out like the owner's C2 sheet of 29/10/2026 (fourgon over 3,5 T), invented values.
    const lorry = {
      left: [
        row('AFFA IRE NOUVELLE'),
        row('400000000000333', 'A9 9 9 9', '1 4C', '200000003'),
        row('IVECO', '-', '99999-A-37', 'Diesel'),
        row('08-08-2021'),
        row('0', 'FOURGON', '3'),
        row('UN', '1.0'),
      ],
      right: [
        row('ESSAI MESSAGERIE'),
        row('1 RUE ESSAI KENITRA'),
        row('400000000000333'),
        row('ASSURANCE ESSAI', 'A9999'),
        row('99999 -A- 37'),
        row('IVECO', '-'),
        row('FOURGON'),
        row('7.0', 'T'),
        row('UN'),
      ],
    };
    const read = parsePlatformSheet(lorry);
    expect(read).toMatchObject({ bodyType: 'FOURGON', trailer: 'UN', seats: 3, crm: '1.0' });
    expect(read).not.toHaveProperty('fiscalPowerCv');
  });

  it('reads the engine size of a moped, the fiscal power of a motorcycle', () => {
    // Laid out like the owner's moped sheet (14 E, "CYLINDRÉE < 50 CM3"), invented values: the
    // number before "2.R" is the cylindrée (owner, 29/10/2026).
    const moped = (fuel, size) => ({
      left: [
        row('400000000000111', 'A9 9 9 9', '1 4E', '200000001'),
        row('FICE', 'XCB LN', 'VF1ABCDEF12345678', fuel),
        row('11-09-2025'),
        row(size, '2 . R', '2'),
        row('ZERO', '1.0'),
      ],
      right: [],
    });
    const petrol = parsePlatformSheet(moped('Essence', '49'));
    expect(petrol).toMatchObject({ fuel: 'PETROL', engineCc: 49, seats: 2, crm: '1.0' });
    expect(petrol).not.toHaveProperty('fiscalPowerCv');
    // Electric: the agency types 3 in the cylindrée field (owner, 29/10/2026), kept as printed.
    const electric = parsePlatformSheet(moped('Electrique', '3'));
    expect(electric).toMatchObject({ fuel: 'ELECTRIC', engineCc: 3 });
    expect(electric).not.toHaveProperty('fiscalPowerCv');
    // A motorcycle: the agency types its fiscal power (5 on the owner's 14 E > 125 cm3 sheet).
    const motorcycle = parsePlatformSheet(moped('Essence', '5'));
    expect(motorcycle).toMatchObject({ fuel: 'PETROL', fiscalPowerCv: 5 });
    expect(motorcycle).not.toHaveProperty('engineCc');
    expect(parsePlatformSheet(moped('Essence', '125'))).toMatchObject({ engineCc: 125 });
  });

  it('keeps a real space that both halves show', () => {
    const named = (right, ...left) => ({
      left: [row('400000000000111', '1 4A', '200000001'), row(...left, 'ZZ1234')],
      right: [row(right), row('ZZ1234'), row('400000000000111')],
    });
    expect(parsePlatformSheet(named('EL IDRISSI ALI', 'EL', 'IDRISSI', 'ALI')).holderName).toBe(
      'EL IDRISSI ALI',
    );
  });
});
