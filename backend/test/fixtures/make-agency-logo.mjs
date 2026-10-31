// Draws the synthetic agency logo and tab icon used by the end-to-end tests (no real agency's
// mark). Run from the repository root: node backend/test/fixtures/make-agency-logo.mjs
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const mark = (size) =>
  `<div style="width:${size}px;height:${size}px;border-radius:${size / 5}px;background:#1e3a8a;color:#fbbf24;font:bold ${size / 2}px Georgia;display:flex;align-items:center;justify-content:center">AE</div>`;
const drawings = {
  'agency-logo-synthetique.png': {
    viewport: { width: 520, height: 160 },
    html: `<div style="display:flex;align-items:center;gap:20px;padding:20px">${mark(120)}
      <div style="font:bold 40px Georgia;color:#1e3a8a">Agence Essai<div style="font:20px Arial;color:#b45309">Synthétique</div></div></div>`,
  },
  'agency-icon-synthetique.png': { viewport: { width: 128, height: 128 }, html: mark(128) },
};

const browser = await chromium.launch();
for (const [name, { viewport, html }] of Object.entries(drawings)) {
  const page = await browser.newPage({ viewport });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`,
  );
  await page.screenshot({
    path: fileURLToPath(new URL(name, import.meta.url)),
    omitBackground: true,
  });
  await page.close();
}
await browser.close();
