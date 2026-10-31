import { defineConfig, devices } from '@playwright/test';

// Smoke test of an installed server (rehearsal VM or the agency's mini-PC), never part of
// `npm run check`: it needs the server running. Settings from the environment:
//   PRODUCTION_URL     https://agence.internal (the agency's one address)
//   SMOKE_USERNAME / SMOKE_PASSWORD   an existing agent account (no two-step)
//   SMOKE_RESOLVE      optional "host:ip" when the name is not in DNS or the hosts file
//   SMOKE_IGNORE_TLS   "1" only when the local authority's root is not installed on this PC
const resolve = process.env.SMOKE_RESOLVE;
export default defineConfig({
  testDir: 'e2e-production',
  outputDir: 'test-results/production',
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PRODUCTION_URL,
    ignoreHTTPSErrors: process.env.SMOKE_IGNORE_TLS === '1',
    locale: 'fr-MA',
    timezoneId: 'Africa/Casablanca',
    launchOptions: resolve
      ? { args: [`--host-resolver-rules=MAP ${resolve.replace(/:(?=[^:]*$)/, ' ')}`] }
      : {},
  },
  projects: [
    {
      name: 'desktop-1366',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
  ],
});
