// Draws the synthetic filled attestation used by the reader's test (no real form, number or
// signature: rule L3). Run from the repository root: node backend/test/fixtures/make-attestation.mjs
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const html = `<!doctype html><html><body style="margin:0;background:#fff">
<div style="width:900px;padding:40px;font:22px Arial;color:#000;background:#f7f3c4">
  <div style="font-weight:bold;font-size:26px">ATTESTATION D'ASSURANCE OBLIGATOIRE</div>
  <div style="font-weight:bold;font-size:26px">DES VEHICULES TERRESTRES A MOTEUR</div>
  <div style="margin-top:20px;font-size:30px;font-weight:bold">USAGE : TOURISME</div>
  <div style="margin-top:10px">NUMERO D'ORDRE | <b style="font-size:30px">14 A 999000111</b></div>
  <div style="margin-top:24px;font-weight:bold">PROPRIETAIRE DU VEHICULE</div>
  <div>Nom TEST SYNTHETIQUE</div>
  <div>N° de la carte d'identité nationale ZZ999999</div>
  <div>Adresse 1 RUE DE L'ESSAI CASABLANCA</div>
  <div style="margin-top:24px;font-weight:bold">POLICE D'ASSURANCE</div>
  <div>Entreprise d'assurances RMA</div>
  <div>Numéro de la police 4099000111</div>
  <div>Intermédiaire AGENCE ESSAI</div>
  <div style="margin-top:24px;font-weight:bold">VEHICULE</div>
  <div>N° d'immatriculation 99999-A-6</div>
  <div>Marque et type DACIA LOGAN</div>
  <div>Type de carrosserie BERLINE</div>
  <div style="margin-top:24px">PERIODE DE GARANTIE</div>
  <div>DU: 01 11 2026</div>
  <div>AU: 31 10 2027</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 1000 } });
await page.setContent(html);
await page.locator('body > div').screenshot({
  path: fileURLToPath(new URL('./attestation-synthetique.png', import.meta.url)),
});
await browser.close();
