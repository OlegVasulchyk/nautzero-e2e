import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://stg-dashboard.nautzero.com',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // ── Setup: login once per role, save storage state to .auth/ ───────────
    {
      name: 'setup',
      testMatch: '**/setup/auth.setup.ts',
    },

    // ── Auth tests: login flow itself (no saved state needed) ───────────────
    {
      name: 'auth',
      testMatch: '**/auth/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Tests that run as Yacht Admin ───────────────────────────────────────
    {
      name: 'yacht-admin',
      testMatch: [
        '**/navigation/yacht-admin.spec.ts',
        '**/cardholders/*.spec.ts',
        '**/cards/*.spec.ts',
        '**/reports/*.spec.ts',
        '**/transactions/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/yacht-admin.json',
      },
      dependencies: ['setup'],
    },

    // ── Tests that run as Cardholder ────────────────────────────────────────
    {
      name: 'cardholder',
      testMatch: ['**/navigation/cardholder.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/cardholder.json',
      },
      dependencies: ['setup'],
    },

    // ── Tests that run as Yacht Manager Admin ───────────────────────────────
    {
      name: 'yacht-manager-admin',
      testMatch: ['**/navigation/yacht-manager.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/yacht-manager-admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
