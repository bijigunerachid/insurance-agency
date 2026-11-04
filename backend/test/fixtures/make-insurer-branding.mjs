// Draws the synthetic insurer logos and card photos used by the end-to-end tests: plain shapes
// and letters, never an insurer's real mark or a real photo.
// Run from the repository root: node backend/test/fixtures/make-insurer-branding.mjs
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const logo = (letters, colour) =>
  `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;font:bold 44px Arial;color:${colour}">
    <div style="width:56px;height:56px;border-radius:14px;background:${colour}"></div>${letters} Essai</div>`;
const photo = (from, to) =>
  `<div style="width:1200px;height:800px;background:linear-gradient(135deg,${from},${to});position:relative">
    <div style="position:absolute;left:0;right:0;bottom:0;height:260px;background:#475569"></div>
    <div style="position:absolute;left:380px;bottom:170px;width:440px;height:130px;border-radius:40px 80px 16px 16px;background:#e2e8f0"></div>
    <div style="position:absolute;left:430px;bottom:130px;width:90px;height:90px;border-radius:50%;background:#0f172a"></div>
    <div style="position:absolute;left:680px;bottom:130px;width:90px;height:90px;border-radius:50%;background:#0f172a"></div></div>`;
const drawings = {
  'rma-logo-synthetique.png': {
    viewport: { width: 360, height: 80 },
    html: logo('RMA', '#272F65'),
  },
  'cat-logo-synthetique.png': {
    viewport: { width: 360, height: 80 },
    html: logo('CAT', '#00877F'),
  },
  'rma-photo-synthetique.jpg': {
    viewport: { width: 1200, height: 800 },
    html: photo('#93c5fd', '#fde68a'),
  },
  'cat-photo-synthetique.jpg': {
    viewport: { width: 1200, height: 800 },
    html: photo('#99f6e4', '#fcd34d'),
  },
};

const browser = await chromium.launch();
for (const [name, { viewport, html }] of Object.entries(drawings)) {
  const page = await browser.newPage({ viewport });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`,
  );
  const jpeg = name.endsWith('.jpg');
  await page.screenshot({
    path: fileURLToPath(new URL(`insurer-branding/${name}`, import.meta.url)),
    ...(jpeg ? { type: 'jpeg', quality: 70 } : { omitBackground: true }),
  });
  await page.close();
}
await browser.close();
