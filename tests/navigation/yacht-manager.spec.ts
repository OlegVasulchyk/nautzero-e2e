import { test, expect } from '@playwright/test';

/**
 * Navigation tests — Yacht Manager Admin
 * Auth state: .auth/yacht-manager-admin.json (loaded via playwright.config.ts)
 */

const pages = [
  { tc: 'TC-009',    title: 'Fleet',               path: '/fleet' },
  { tc: 'TC-018',    title: 'Notifications',        path: '/notifications' },
  { tc: 'TC-021',    title: 'Settings / Profile',   path: '/settings/profile' },
  { tc: 'TC-024',    title: 'Settings / Admins',    path: '/settings/admins' },
  { tc: 'TC-029',    title: 'Settings / Alerts',    path: '/settings/alerts' },
  { tc: 'TC-031',    title: 'Settings / Help',      path: '/settings/help' },
];

for (const { tc, title, path } of pages) {
  test(`${tc} | Yacht Manager Admin navigates to ${title}`, async ({ page }) => {
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
