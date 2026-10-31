import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { E2E_DOCUMENTS_DIR } from './e2e/paths.js';

// End-to-end tests run the real backend (test database, backend/.env.test) and the built
// frontend served by `vite preview`, which forwards /api like the production proxy.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  // Four browsers next to the backend, the frontend server and PostgreSQL saturated this laptop
  // (85 % CPU): pages then took over 15 s. Two at a time keeps runs reliable.
  workers: 2,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  // Argon2 (64 MiB per hash) runs for every sign-in and password change; with several browsers
  // in parallel on one laptop a step can take a few seconds. The hashing cost is not lowered.
  expect: { timeout: 15_000 },
  // The longest journeys (catalogue: model, usage, product, two sign-ins) took 38–40 s when
  // they started alongside three other browsers; no step was stuck (traces checked).
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    locale: 'fr-MA',
    timezoneId: 'Africa/Casablanca',
  },
  projects: [
    {
      name: 'desktop-1366',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'phone-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start:test -w backend',
      url: 'http://127.0.0.1:3100/api/health',
      // Every test signs in from 127.0.0.1: raise the per-address limit for this run only
      // (the limit itself is covered by the integration tests).
      // Scans attached during the run go to their own folder, emptied by the global setup.
      // Synthetic agency details at their longest, so the printed receipt is checked full.
      env: {
        LOGIN_MAX_PER_IP: '1000',
        DOCUMENTS_DIR: E2E_DOCUMENTS_DIR,
        AGENCY_NAME: 'Agence Essai Assurances et Conseils',
        AGENCY_ADDRESS: '123 boulevard de l’Essai, résidence Test, 2e étage, bureau 4, Kenitra',
        AGENCY_PHONE: '05 00 00 00 00',
        AGENCY_TAGLINE: 'Agent général synthétique',
        AGENCY_FAX: '05 00 00 00 01',
        AGENCY_EMAIL: 'agence.essai@exemple.ma',
        AGENCY_ICE: '000000000000000',
        AGENCY_ACAPS_NUMBER: 'AGR-0000-TEST',
        AGENCY_LEGAL_FORM: 'S.A.R.L au capital de 100 000,00 DH',
        AGENCY_PATENTE: '00000000',
        AGENCY_IF: '00000000',
        AGENCY_RC: '0000',
        AGENCY_CNSS: '0000000',
        AGENCY_LOGO_FILE: fileURLToPath(
          new URL('backend/test/fixtures/agency-logo-synthetique.png', import.meta.url),
        ),
        AGENCY_ICON_FILE: fileURLToPath(
          new URL('backend/test/fixtures/agency-icon-synthetique.png', import.meta.url),
        ),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run build -w frontend && npm run preview -w frontend',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3100' },
    },
  ],
});
