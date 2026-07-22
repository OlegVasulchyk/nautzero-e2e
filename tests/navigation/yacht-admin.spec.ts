import { test, expect } from '@playwright/test';

/**
 * Navigation tests — Yacht Admin
 * Auth state: .auth/yacht-admin.json (loaded via playwright.config.ts)
 */

const pages = [
  { tc: 'TC-nav-01', title: 'Dashboard',            path: '/dashboard' },
  { tc: 'TC-005',    title: 'Finance',               path: '/finance' },
  { tc: 'TC-006',    title: 'Manual Ledger',         path: '/accounts' },
  { tc: 'TC-008',    title: 'Impact',                path: '/impact' },
  { tc: 'TC-010',    title: 'Card Transactions',     path: '/card-transactions' },
  { tc: 'TC-012',    title: 'Cardholders',           path: '/cardholders' },
  { tc: 'TC-013',    title: 'Banking',               path: '/banking' },
  { tc: 'TC-014',    title: 'Charters',              path: '/charter' },
  { tc: 'TC-015',    title: 'Statements',            path: '/statements' },
  { tc: 'TC-017',    title: 'Notifications',         path: '/notifications' },
  { tc: 'TC-020',    title: 'Settings / Profile',    path: '/settings/profile' },
  { tc: 'TC-023',    title: 'Settings / Admins',     path: '/settings/admins' },
  { tc: 'TC-025',    title: 'Settings / Departments',path: '/settings/departments' },
  { tc: 'TC-026',    title: 'Settings / Budget',     path: '/settings/budget' },
  { tc: 'TC-027',    title: 'Settings / Categories', path: '/settings/categories' },
  { tc: 'TC-028',    title: 'Settings / Alerts',     path: '/settings/alerts' },
  { tc: 'TC-nav-02', title: 'Settings / Payout',     path: '/settings/payout' },
  { tc: 'TC-030',    title: 'Settings / Help',       path: '/settings/help' },
];

for (const { tc, title, path } of pages) {
  test(`${tc} | Yacht Admin navigates to ${title}`, async ({ page }) => {
    await page.goto(path);

    // Not bounced to login — session is valid
    await expect(page).not.toHaveURL(/\/user\/login/, { timeout: 10_000 });

    // URL matches expected path
    await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')));
  });
}
