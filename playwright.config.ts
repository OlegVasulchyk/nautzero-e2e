import { defineConfig, devices, type Project } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

// Role names must match src/fixtures/users.ts (kept inline so the config stays
// importable even when .env is missing).
const ROLES = [
  'yacht-admin',
  'cardholder',
  'yacht-admin-card',
  'cardholder-physical',
  'cardholder-virtual',
  'yacht-manager-admin',
  'yacht-manager-admin-eur',
] as const;

type Role = (typeof ROLES)[number];

// devices['Desktop Chrome'] carries its own 1280x720 viewport, which silently
// overrode the global 1440x900 — set the viewport explicitly on top of it.
// 1440x900 matters: some metrics (e.g. Remaining Balance) truncate when narrower.
const desktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
};

/** `use` block for a test project running as the given role. */
const asRole = (role: Role) => ({ ...desktop, storageState: `.auth/${role}.json` });

// Per-role setup: each logs in ONE user (auth.setup.ts tags each login with
// @setup-<role>), so a test project depends only on the role it needs and
// running one project logs in only that user.
const setupProjects: Project[] = ROLES.map((role) => ({
  name: `setup:${role}`,
  testMatch: '**/setup/auth.setup.ts',
  grep: new RegExp(`@setup-${role}$`),
  use: desktop,
}));

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
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    ...setupProjects,

    // ── Auth tests: login flow itself (no saved state needed) ───────────────
    {
      name: 'auth',
      testMatch: '**/auth/*.spec.ts',
      use: desktop,
    },

    // ── Tests that run as Yacht Admin with Card (dashboard card management) ──
    {
      name: 'yacht-admin-card',
      testMatch: ['**/cards/dashboard-card.spec.ts'],
      use: asRole('yacht-admin-card'),
      dependencies: ['setup:yacht-admin-card'],
    },

    // ── Cardholder with a Physical card (own dashboard card actions) ─────────
    {
      name: 'cardholder-physical',
      testMatch: ['**/cards/cardholder-dashboard.spec.ts'],
      grep: /Physical/,
      use: asRole('cardholder-physical'),
      dependencies: ['setup:cardholder-physical'],
    },

    // ── Cardholder with a Virtual card (own dashboard card actions) ──────────
    {
      name: 'cardholder-virtual',
      testMatch: ['**/cards/cardholder-dashboard.spec.ts'],
      grep: /Virtual/,
      use: asRole('cardholder-virtual'),
      dependencies: ['setup:cardholder-virtual'],
    },

    // ── Tests that run as Yacht Admin ────────────────────────────────────────
    {
      name: 'yacht-admin',
      testMatch: [
        '**/navigation/yacht-admin.spec.ts',
        '**/cardholders/*.spec.ts',
        '**/manual-ledger/*.spec.ts',
      ],
      use: asRole('yacht-admin'),
      // Also depends on setup:cardholder — tests/cardholders/fund-requests.spec.ts
      // opens its own second browser context with .auth/cardholder.json.
      dependencies: ['setup:yacht-admin', 'setup:cardholder'],
    },

    // ── Tests that run as Cardholder ─────────────────────────────────────────
    {
      name: 'cardholder',
      testMatch: ['**/navigation/cardholder.spec.ts'],
      use: asRole('cardholder'),
      dependencies: ['setup:cardholder'],
    },

    // ── Tests that run as Yacht Manager Admin ────────────────────────────────
    {
      name: 'yacht-manager-admin',
      testMatch: ['**/navigation/yacht-manager.spec.ts'],
      use: asRole('yacht-manager-admin'),
      dependencies: ['setup:yacht-manager-admin'],
    },

    // ── Fleet + Settings (Create Boat / Create Admin), once per account ──────
    {
      name: 'yacht-manager-admin-usd',
      testMatch: ['**/fleet/*.spec.ts', '**/settings/*.spec.ts'],
      grep: /USD/,
      use: asRole('yacht-manager-admin'),
      dependencies: ['setup:yacht-manager-admin'],
    },
    {
      name: 'yacht-manager-admin-eur',
      testMatch: ['**/fleet/*.spec.ts', '**/settings/*.spec.ts'],
      grep: /EUR/,
      use: asRole('yacht-manager-admin-eur'),
      dependencies: ['setup:yacht-manager-admin-eur'],
    },

    // ── Airwallex Issuing simulation API — no browser, no NautZero login ─────
    {
      name: 'awx-api',
      testMatch: ['**/api/*.spec.ts'],
    },
  ],
});
