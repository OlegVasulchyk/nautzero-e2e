import { test, expect } from '@playwright/test';

/**
 * Navigation tests — Cardholder
 * Auth state: .auth/cardholder.json (loaded via playwright.config.ts)
 */

const pages = [
  { tc: 'TC-nav-03', title: 'Dashboard',          path: '/dashboard' },
  { tc: 'TC-007',    title: 'Impact',              path: '/impact' },
  { tc: 'TC-011',    title: 'Card Transactions',   path: '/card-transactions' },
  { tc: 'TC-016',    title: 'Statements',          path: '/statements' },
  { tc: 'TC-019',    title: 'Notifications',       path: '/notifications' },
  { tc: 'TC-022',    title: 'Settings / Profile',  path: '/settings/profile' },
  { tc: 'TC-nav-04', title: 'Settings / Alerts',   path: '/settings/alerts' },
  { tc: 'TC-nav-05', title: 'Settings / Help',     path: '/settings/help' },
];

for (const { tc, title, path } of pages) {
  test(`${tc} | Cardholder navigates to ${title}`, async ({ page }) => {
    await page.goto(path);

    await expect(page).not.toHaveURL(/\/user\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')));

    // Connectivity error banner can surface a few seconds after load (delayed
    // background request).
    const connectivityBanner = page.getByText('Having trouble connecting');
    const bannerAppeared = await connectivityBanner
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    expect(bannerAppeared, `Connectivity error banner appeared on ${title}`).toBe(false);
  });
}
