// Draws synthetic PDFs laid out like the RMA platform's sheets (conditions particulières on the
// left, attestation on the right, text only), with invented values: a new contract, a
// vehicle-change avenant and a provisional attestation (attestation half only); and a CAT sheet
// (values only, like CAT's platform PDF: a passenger transport contract, guarantee table in the form's order). Run from the repository
// root:
// node backend/test/fixtures/make-platform-sheet.mjs
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Each value at its own column (CSS pixels from the left of its half), like the platform's sheet.
const left = [
  [[0, 'AFFAIRE NOUVELLE']],
  [
    [0, '400000000000111'],
    [160, 'A9999'],
    [260, '14A 999000222'],
  ],
  [
    [0, '01-11-2026'],
    [80, '18H'],
    [160, '01-11-2027'],
    [240, '18H'],
    [300, 'TOURISME'],
  ],
  [
    [0, '99999999999999999999'],
    [160, 'DUREE FERME'],
    [260, '########'],
  ],
  [
    [0, 'TEST SYNTHETIQUE'],
    [260, 'ZZ999999'],
  ],
  [[0, '1 RUE DE L ESSAI KENITRA']],
  [
    [0, 'TEST SYNTHETIQUE'],
    [260, '01-01-1980'],
  ],
  [
    [0, 'DACIA LOGAN'],
    [160, 'VF1ABCDEF12345678'],
    [330, 'Diesel'],
  ],
  [[0, '15-03-2020']],
  [
    [0, '6'],
    [160, 'VP'],
    [330, '5'],
  ],
  [
    [0, 'ZERO'],
    [330, '1.0'],
  ],
  [
    [0, 'Responsabilite Civile'],
    [160, '50 000 000'],
    [330, '1 200.00'],
  ],
  // An optional guarantee without a premium, ending with the formula (« RC »).
  [
    [0, 'Defense et Recours'],
    [160, 'Forfait 10.000.00'],
    [300, 'RC'],
  ],
  [
    [0, '#1300.00#'],
    [55, '#200.00#'],
    [110, '#0.00#'],
    [165, '#1500.00#'],
    [225, '#20.00#'],
    [280, '#0.00#'],
    [330, '#1520.00#'],
  ],
  [
    [0, 'KENITRA'],
    [160, '20-10-2026'],
    // The platform drops the accented letters.
    [260, 'Mode de r glement :Esp ce'],
  ],
];
const right = [
  // The platform's own reference of the document, above the name.
  [[0, '00000000-0000-4000-8000-000000000000']],
  [[0, 'TEST SYNTHETIQUE']],
  [[0, 'ZZ999999']],
  [[0, '1 RUE DE L ESSAI KENITRA']],
  [[0, '400000000000111']],
  [
    [0, 'AGENCE ESSAI'],
    [200, 'A9999'],
  ],
  [[0, '99999-A-6']],
  [[0, 'VF1ABCDEF12345678']],
  [[0, 'DACIA LOGAN']],
  [[0, 'VP']],
  [[0, 'ZERO']],
  [[0, 'DUREE FERME']],
  [[0, 'Dim 01 Novembre 2026 18H']],
  [[0, 'Lun 01 Novembre 2027 18H']],
  [[0, 'KENITRA 20-10-2026']],
];
// A vehicle-change avenant of a contract made before the app, laid out like RMA's:
// its title above the policy line, a plate and no chassis, the avenant's own
// amount in the totals while the guarantees show the year's premiums.
const avenantLeft = [
  [
    [0, 'AVENANT DE CHANGEMENT DE VEHICULE N'],
    [260, '2600000001'],
  ],
  [
    [0, '400000000000222'],
    [160, 'A9999'],
    [260, '14A 999000333'],
  ],
  [
    [0, '27-06-2026'],
    [80, '18H'],
    [160, '21-03-2027'],
    [240, '24H'],
    [300, 'TOURISME'],
  ],
  [
    [0, '99999999999999999998'],
    [160, 'DUREE FERME'],
    [260, '########'],
  ],
  [
    [0, 'TEST AVENANT'],
    [260, 'ZZ888888'],
  ],
  [[0, '2 RUE DE L ESSAI KENITRA']],
  [
    [0, 'TEST AVENANT'],
    [260, '02-02-1990'],
  ],
  [
    [0, 'RENAULT'],
    [80, '-'],
    [160, '88888-A-57'],
    [330, 'Diesel'],
  ],
  [[0, '14-12-2017']],
  [
    [0, '6'],
    [160, 'C.I'],
    [330, '5'],
  ],
  [
    [0, 'ZERO'],
    [330, '0.9'],
  ],
  [
    [0, 'Responsabilite Civile'],
    [160, '50 000 000'],
    [330, '2.350.40'],
  ],
  [
    [0, '#412.18#'],
    [55, '#73.46#'],
    [110, '#10.00#'],
    [165, '#495.64#'],
    [225, '#17.00#'],
    [280, '#0.00#'],
    [330, '#512.64#'],
  ],
  [
    [0, 'KENITRA'],
    [160, '28-10-2026'],
    [260, 'Mode de r glement :Esp ce'],
  ],
];
const avenantRight = [
  [[0, 'TEST AVENANT']],
  [[0, 'ZZ888888']],
  [[0, '2 RUE DE L ESSAI KENITRA']],
  [[0, '400000000000222']],
  [
    [0, 'AGENCE ESSAI'],
    [200, 'A9999'],
  ],
  [[0, '88888 -A- 57']],
  [[0, 'RENAULT -']],
  [[0, 'C. I']],
  [[0, 'ZERO']],
  [[0, 'DUREE FERME']],
  [[0, 'Sam 27 Juin 2026 18H']],
  [[0, 'Dim 21 Mars 2027 24H']],
  [[0, 'KENITRA 28-10-2026']],
];

// A provisional attestation: the usage first, no number (the pink form carries it), the month
// printed letter by letter like on the platform's sheet, the gaps the narrow I leaves in the body
// type, the seats under the trailer.
const provisionalLeft = [[[0, '(*) Dont 12.40 Dh representant la taxe parafiscale.']]];
const provisionalRight = [
  [[0, 'TOURI SME']],
  [[0, 'TEST PROVISOIRE']],
  [[0, 'ZZ777777']],
  [[0, '3 RUE DE L ESSAI KENITRA']],
  [[0, '400000000000333']],
  [
    [0, 'AGENCE ESSAI'],
    [200, 'A9999'],
  ],
  [[0, '77777 -B- 06']],
  [[0, 'PEUGEOT -']],
  [[0, 'CONDUI TE INTERI EURE']],
  [[0, 'ZERO']],
  [[0, '7']],
  [[0, 'DUREE FERME']],
  [[0, 'Mar 15 Ju i l l e t 2025 18H']],
  [[0, 'Ven 15 Ao u t 2025 18H']],
  [[0, 'KENITRA 29-10-2026']],
];

// Dates and numbers are printed letter by letter on the platform's sheet.
const spaced = (text) => (/^[\d-]+$/.test(text) ? 'letter-spacing:2px;' : '');
const column = (rows, x) =>
  rows
    .map((parts, r) =>
      parts
        .map(
          ([left, text]) =>
            `<div style="position:absolute;left:${x + left}px;top:${40 + r * 26}px;font:10px Arial;${spaced(text)}">${text}</div>`,
        )
        .join(''),
    )
    .join('');

// CAT: intermédiaire / police / attestation, code, effet / expiration, agrément / ville,
// souscripteur, adresse, propriétaire, usage / carrosserie, immatriculation / marque / type,
// n° série / puissance, mise en circulation / remorque / places, carburant, CRM / réduction
// saharienne; the ten guarantee rows (RC, DC, DV, incendie, vol, bris de glaces, défense et
// recours, remorque, événements catastrophiques RC and GA), PPC, totals.
const catLeft = [
  [
    [0, 'AGENCE ESSAI'],
    [220, 'C2026/000111'],
    [380, '165000111'],
  ],
  [[300, '99999']],
  [
    [0, '01/11/2026 à 00:00'],
    [170, '31/10/2027 à 23:59'],
  ],
  [
    [0, '0'],
    [150, 'KENITRA'],
  ],
  [
    [0, 'TRANSPORTS ESSAI SARL'],
    [350, 'ZZ999111'],
  ],
  [
    [0, '1 RUE DE L ESSAI KENITRA'],
    [350, 'KENITRA'],
  ],
  [
    [0, 'TRANSPORTS ESSAI SARL'],
    [350, 'ZZ999111'],
  ],
  [
    [0, 'CAR DE LIGNE'],
    [220, 'C.I'],
  ],
  [
    [0, '99999-B-6'],
    [200, 'MERCEDES'],
    [350, 'CAR'],
  ],
  [
    [0, 'WDB9999999'],
    [260, '24'],
  ],
  [
    [20, '01/01/2015'],
    [210, 'NON'],
    [350, 'CINQUANTE + CHAUFFEUR'],
  ],
  [[0, 'DIESEL']],
  [
    [150, '1'],
    [270, 'Sans réduction saharienne'],
  ],
  [[400, '8000,00']],
  [
    [90, '0'],
    [200, '0'],
    [420, '0'],
  ],
  [
    [90, '0'],
    [200, '0'],
    [420, '0'],
  ],
  [
    [90, '500000'],
    [400, '1500'],
  ],
  [
    [90, '500000'],
    [200, '0,05'],
    [410, '600'],
  ],
  [
    [90, '30000'],
    [200, '0,1'],
    [410, '900'],
  ],
  [[420, '0']],
  [[420, '0']],
  [[400, '150,25']],
  [[400, '50,75']],
  [[90, '0']],
  [[350, 'R.Covid :0']],
  [
    [-10, '11201'],
    [90, '112,01'],
    [230, '1680,15'],
    [300, '17'],
    [350, '13010,16'],
  ],
];
const catRight = [
  [[0, 'TRANSPORTS ESSAI SARL']],
  [[0, 'ZZ999111']],
  [[0, '1 RUE DE L ESSAI KENITRA']],
  [[0, 'C2026/000111']],
  [[0, 'AGENCE ESSAI']],
  [[0, '99999-B-6']],
  [[0, 'MERCEDES']],
  [[0, 'CI']],
  [[0, 'NON']],
  [[0, 'CINQUANTE + CHAUFFEUR']],
  [
    [0, 'DIM 01'],
    [60, 'NOVEMBRE'],
    [150, '2026 à 00:00'],
  ],
  [
    [0, 'DIM 31'],
    [60, 'OCTOBRE'],
    [150, '2027 à 23:59'],
  ],
  [
    [0, 'KENITRA'],
    [150, '20/10/2026'],
  ],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [rowsLeft, rowsRight, file] of [
  [left, right, './platform-synthetique.pdf'],
  [avenantLeft, avenantRight, './platform-avenant-synthetique.pdf'],
  [provisionalLeft, provisionalRight, './platform-provisoire-synthetique.pdf'],
  [catLeft, catRight, './platform-cat-synthetique.pdf'],
]) {
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${column(rowsLeft, 20)}${column(rowsRight, 600)}</body></html>`,
  );
  await page.pdf({
    path: fileURLToPath(new URL(file, import.meta.url)),
    width: '1123px',
    height: '794px',
  });
}
await browser.close();
