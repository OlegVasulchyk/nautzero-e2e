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
    // ── Per-role setup: each logs in ONE user, tagged so test projects can
    //    depend only on the role they need (running one project = one login) ──
    { name: 'setup:yacht-admin',          testMatch: '**/setup/auth.setup.ts', grep: /@setup-yacht-admin$/ },
    { name: 'setup:cardholder',           testMatch: '**/setup/auth.setup.ts', grep: /@setup-cardholder$/ },
    { name: 'setup:yacht-admin-card',     testMatch: '**/setup/auth.setup.ts', grep: /@setup-yacht-admin-card$/ },
    { name: 'setup:cardholder-physical',  testMatch: '**/setup/auth.setup.ts', grep: /@setup-cardholder-physical$/ },
    { name: 'setup:cardholder-virtual',   testMatch: '**/setup/auth.setup.ts', grep: /@setup-cardholder-virtual$/ },
    { name: 'setup:yacht-manager-admin',  testMatch: '**/setup/auth.setup.ts', grep: /@setup-yacht-manager-admin$/ },

    // ── Auth tests: login flow itself (no saved state needed) ───────────────
    {
      name: 'auth',
      testMatch: '**/auth/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Tests that run as Yacht Admin with Card (dashboard card management) ────
    {
      name: 'yacht-admin-card',
      testMatch: ['**/cards/dashboard-card.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/yacht-admin-card.json',
      },
      dependencies: ['setup:yacht-admin-card'],
    },

    // ── Cardholder with a Physical card (own dashboard card actions) ──────────
    {
      name: 'cardholder-physical',
      testMatch: ['**/cards/cardholder-dashboard.spec.ts'],
      grep: /Physical/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/cardholder-physical.json',
      },
      dependencies: ['setup:cardholder-physical'],
    },

    // ── Cardholder with a Virtual card (own dashboard card actions) ───────────
    {
      name: 'cardholder-virtual',
      testMatch: ['**/cards/cardholder-dashboard.spec.ts'],
      grep: /Virtual/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/cardholder-virtual.json',
      },
      dependencies: ['setup:cardholder-virtual'],
    },

    // ── Tests that run as Yacht Admin ───────────────────────────────────────
    {
      name: 'yacht-admin',
      testMatch: [
        '**/navigation/yacht-admin.spec.ts',
        '**/cardholders/*.spec.ts',
        '**/reports/*.spec.ts',
        '**/transactions/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/yacht-admin.json',
      },
      dependencies: ['setup:yacht-admin'],
    },

    // ── Tests that run as Cardholder ────────────────────────────────────────
    {
      name: 'cardholder',
      testMatch: ['**/navigation/cardholder.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/cardholder.json',
      },
      dependencies: ['setup:cardholder'],
    },

    // ── Tests that run as Yacht Manager Admin ───────────────────────────────
    {
      name: 'yacht-manager-admin',
      testMatch: ['**/navigation/yacht-manager.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/yacht-manager-admin.json',
      },
      dependencies: ['setup:yacht-manager-admin'],
    },
  ],
});
