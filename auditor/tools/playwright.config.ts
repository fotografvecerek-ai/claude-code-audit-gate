// Konfigurace Playwrightu pro workspace auditora (ne repa). npx playwright test -c tools/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './playwright', timeout: 60_000, retries: 0, workers: 2, fullyParallel: false,
  reporter: [['dot'], ['json', { outputFile: '../AUDIT/01_nalezy/playwright-results.json' }]],
  outputDir: '../test-results',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure', locale: 'cs-CZ', timezoneId: 'Europe/Prague' },
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.01 } },
});
