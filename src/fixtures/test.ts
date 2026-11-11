import { test as base, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// The suite's `test` — import { test, expect } from here, not '@playwright/test'.
//
// Staging intermittently never fires the window `load` event (a background
// request hangs), so the default waitUntil:'load' made page.goto / reload /
// waitForURL burn the whole test timeout on a page that was already usable.
// Every assertion in this suite is web-first (it waits for the element it
// needs), so DOM-ready is the right navigation signal.
// ─────────────────────────────────────────────────────────────────────────────

/** Make `page` navigations wait for DOMContentLoaded unless a call says otherwise. */
export function relaxNavigation(page: Page): Page {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  const waitForURL = page.waitForURL.bind(page);

  page.goto = (url, options) => goto(url, { waitUntil: 'domcontentloaded', ...options });
  page.reload = (options) => reload({ waitUntil: 'domcontentloaded', ...options });
  page.waitForURL = (url, options) => waitForURL(url, { waitUntil: 'domcontentloaded', ...options });
  return page;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await use(relaxNavigation(page));
  },
});

export { expect } from '@playwright/test';
export type { Page, Locator, Browser, BrowserContext } from '@playwright/test';
