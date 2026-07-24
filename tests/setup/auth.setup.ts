import { test as setup } from '@playwright/test';
import { login } from '../../src/helpers/auth.helper';
import { USERS } from '../../src/fixtures/users';

/**
 * Auth setup — one login per role, saving browser storage state to .auth/*.json.
 * Each setup carries a unique @tag so the config can depend on just the role it
 * needs (see the per-role `setup:*` projects in playwright.config.ts). Running a
 * single test project therefore logs in only that project's user.
 */

setup('authenticate as Yacht Admin @setup-yacht-admin', async ({ page }) => {
  await login(page, USERS['yacht-admin']);
  await page.context().storageState({ path: '.auth/yacht-admin.json' });
});

setup('authenticate as Cardholder @setup-cardholder', async ({ page }) => {
  await login(page, USERS['cardholder']);
  await page.context().storageState({ path: '.auth/cardholder.json' });
});

setup('authenticate as Yacht Admin with Card @setup-yacht-admin-card', async ({ page }) => {
  await login(page, USERS['yacht-admin-card']);
  await page.context().storageState({ path: '.auth/yacht-admin-card.json' });
});

setup('authenticate as Cardholder Physical card @setup-cardholder-physical', async ({ page }) => {
  await login(page, USERS['cardholder-physical']);
  await page.context().storageState({ path: '.auth/cardholder-physical.json' });
});

setup('authenticate as Cardholder Virtual card @setup-cardholder-virtual', async ({ page }) => {
  await login(page, USERS['cardholder-virtual']);
  await page.context().storageState({ path: '.auth/cardholder-virtual.json' });
});

setup('authenticate as Yacht Manager Admin @setup-yacht-manager-admin', async ({ page }) => {
  await login(page, USERS['yacht-manager-admin']);
  await page.context().storageState({ path: '.auth/yacht-manager-admin.json' });
});

setup('authenticate as Yacht Manager Admin EUR @setup-yacht-manager-admin-eur', async ({ page }) => {
  await login(page, USERS['yacht-manager-admin-eur']);
  await page.context().storageState({ path: '.auth/yacht-manager-admin-eur.json' });
});
