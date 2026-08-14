import { test, expect, type Page, type Locator } from '@playwright/test';
import { authState } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — UI consistency (fonts, brand colors, button styling)
//
// Functional coverage of this page lives in the other manual-ledger specs;
// this file is purely about "did the look-and-feel drift" — font family,
// brand yellow, border-radius, hover/cursor states — the kind of thing a
// CSS refactor can quietly break without any functional test noticing.
//
// Values below (colors, radii, font names) were read directly off computed
// styles on this page, not guessed — see the values in each assertion.
//
// Same desktop/mobile duplicate-render quirk as everywhere else in this
// suite — every locator here is filtered to the visible instance.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ storageState: authState('yacht-admin') });

test.beforeEach(async ({ page }) => {
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Manual Transactions' })).toBeVisible();
});

function visibleButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true }).locator('visible=true').first();
}

test('Headings use the brand font and colors', async ({ page }) => {
  const h1 = page.getByRole('heading', { level: 1 }).locator('visible=true').first();
  await expect(h1).toHaveCSS('font-family', /Effra/);
  await expect(h1).toHaveCSS('font-weight', '700');
  await expect(h1).toHaveCSS('color', 'rgb(0, 0, 0)');

  const h2 = page.getByRole('heading', { level: 2 }).locator('visible=true').first();
  await expect(h2).toHaveCSS('font-family', /Effra/);
  await expect(h2).toHaveCSS('color', 'rgb(46, 79, 161)'); // brand blue
});

test('Primary button — brand yellow fill, correct radius, bold label', async ({ page }) => {
  const btn = visibleButton(page, 'Add Manual Entry');
  await expect(btn).toHaveCSS('background-color', 'rgb(224, 227, 34)');
  await expect(btn).toHaveCSS('border-radius', '3px');
  await expect(btn).toHaveCSS('font-weight', '700');
  await expect(btn).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(btn).toHaveCSS('cursor', 'pointer');
});

test('Primary button — hover darkens the fill without changing shape', async ({ page }) => {
  const btn = visibleButton(page, 'Add Cash Entry');
  await expect(btn).toHaveCSS('background-color', 'rgb(224, 227, 34)');

  await btn.hover();
  await expect(btn).toHaveCSS('background-color', 'rgb(212, 215, 32)');
  await expect(btn).toHaveCSS('border-radius', '3px'); // unchanged on hover
});

test('Secondary (outline) buttons — white fill, brand-color border', async ({ page }) => {
  for (const name of ['PDF', 'XLSX']) {
    const btn = visibleButton(page, name);
    await expect(btn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(btn).toHaveCSS('border-color', 'rgb(224, 227, 34)');
    await expect(btn).toHaveCSS('border-width', '2px');
    await expect(btn).toHaveCSS('cursor', 'pointer');
  }
});

test('Filter dropdown triggers share the same neutral styling', async ({ page }) => {
  const triggers = page.locator('button[aria-haspopup="listbox"]').locator('visible=true');
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    await expect(trigger).toHaveCSS('border-color', 'rgb(206, 206, 206)');
    await expect(trigger).toHaveCSS('border-radius', '5px');
    await expect(trigger).toHaveCSS('cursor', 'pointer');
  }
});
