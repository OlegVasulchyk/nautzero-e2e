import { expect, type Page } from '@playwright/test';

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anchored URL pattern for an app path: matches "/charter" or "/charter?x",
 * but NOT "/charters" (the old unanchored check let sibling routes pass).
 */
export function urlPattern(path: string): RegExp {
  return new RegExp(`${escapeRegExp(path)}([/?#]|$)`);
}

/**
 * Assert a navigation target actually loaded for the logged-in role:
 *  1. the URL settles on the expected path (a bounce to /user/login fails this
 *     positively, instead of the old immediate not.toHaveURL check that passed
 *     before any redirect could happen);
 *  2. the "Having trouble connecting" banner doesn't surface. It can appear a
 *     few seconds after load (delayed background request), so we watch for a
 *     short window — 3s, not the previous 10s that every passing test paid.
 */
export async function expectPageAvailable(page: Page, path: string, title: string): Promise<void> {
  await page.goto(path);

  await expect(page).toHaveURL(urlPattern(path), { timeout: 10_000 });

  const connectivityBanner = page.getByText('Having trouble connecting');
  const bannerAppeared = await connectivityBanner
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  expect(bannerAppeared, `Connectivity error banner appeared on ${title}`).toBe(false);
}
