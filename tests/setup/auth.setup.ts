import { test as setup } from '@playwright/test';
import { login } from '../../src/helpers/auth.helper';
import { USERS } from '../../src/fixtures/users';

/**
 * Auth setup — runs once before the test suite.
 * Logs in as each role and saves the browser storage state to a file.
 * Navigation and other tests load this state instead of logging in each time.
 */

setup('authenticate as Yacht Admin', async ({ page }) => {
  await login(page, USERS['yacht-admin']);
  await page.context().storageState({ path: '.auth/yacht-admin.json' });
});

setup('authenticate as Cardholder', async ({ page }) => {
  await login(page, USERS['cardholder']);
  await page.context().storageState({ path: '.auth/cardholder.json' });
});

setup('authenticate as Yacht Manager Admin', async ({ page }) => {
  await login(page, USERS['yacht-manager-admin']);
  await page.context().storageState({ path: '.auth/yacht-manager-admin.json' });
});
