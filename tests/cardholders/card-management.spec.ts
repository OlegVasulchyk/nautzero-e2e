import { test, expect } from '@playwright/test';
import { CardholdersPage } from '../../src/pages/CardholdersPage';
import { fillMaskedInput } from '../../src/helpers/ui.helper';
import { randInt } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-036  Cardholders — Freeze / Unfreeze cardholder's card
// TC-037  Cardholders — Replace card (physical; 14-day restriction applies)
// TC-038  Cardholders — Cancel card
// TC-041  Cardholders — Edit Cardholder Balance & Monthly Card Limit
// TC-042  Cardholders — Balance over max limit (negative)
// TC-043  Cardholders — Balance over remaining balance (negative)
//
// Auth: yacht-admin storageState
// ─────────────────────────────────────────────────────────────────────────────

// ── TC-036: Freeze / Unfreeze ─────────────────────────────────────────────────
test.describe('TC-036 | Freeze / Unfreeze cardholder card', () => {
  test.setTimeout(60_000);

  test('TC-036 | Freezes and unfreezes a cardholder card from Cardholders page', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    // Normalize state → always start from Active (test must not depend on initial card state)
    const state = await cardholders.expandActiveCardholder();
    await cardholders.ensureExpandedCardActive(state);

    // ── Freeze ──────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Freeze', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to freeze this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Freeze button changes to Unfreeze
    await expect(page.getByRole('button', { name: 'Unfreeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // ── Unfreeze ─────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Unfreeze', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to reactivate this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Unfreeze button changes back to Freeze
    await expect(page.getByRole('button', { name: 'Freeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

});

// ── TC-037: Replace Card ──────────────────────────────────────────────────────
test.describe('TC-037 | Replace cardholder card', () => {
  test.setTimeout(120_000);

  // NOTE: replacement can only be requested once every 14 days per card.

  test('TC-037 | Replaces a cardholder physical card and provides shipping address', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    await cardholders.expandActiveCardholder({ requireReplace: true, requirePhysical: true });

    // ── Confirm replace ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Replace', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Replace Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to replace this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // ── Shipping address form ────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Order My Replacement Card' })).toBeVisible({ timeout: 10_000 });
    await cardholders.fillShippingAddress();
    await page.getByRole('button', { name: 'Continue' }).click();

    // ── Confirm screen ───────────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Confirm Replacement Card Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Success — confirm screen closes after submission (card creation at the
    // backend can take up to ~60s)
    await expect(page.getByRole('heading', { name: 'Confirm Replacement Card Details' })).not.toBeVisible({ timeout: 60_000 });
  });

});

// ── TC-038: Cancel Card ───────────────────────────────────────────────────────
test.describe('TC-038 | Cancel cardholder card', () => {
  test.setTimeout(60_000);

  test('TC-038 | Cancels a cardholder card with confirmation', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    await cardholders.expandActiveCardholder();

    // ── Cancel ───────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Cancel Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to cancel this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card cancelled — confirmation closes, and the row's actions flip to the
    // disabled "unavailable" variant that cancelled cards render.
    await expect(page.getByRole('heading', { name: 'Cancel Card' })).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Freeze unavailable for this card' }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

});

// ── TC-041: Edit Balance & Monthly Limit (positive) ─────────────────────────────
test.describe('TC-041 | Edit cardholder balance & monthly limit', () => {
  test.setTimeout(45_000);
  // Wide viewport so the "Remaining Balance" metric renders in full (not truncated)
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('TC-041 | Edits Cardholder Balance and Monthly Card Limit on an active card', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    await cardholders.openFirstCardholderEdit();
    const remaining = await cardholders.readRemainingBalance();

    // Balance top-up must not exceed the account remaining balance, and is capped at
    // $100,000. Stay safely below both limits. Whole-dollar amounts: these formatted
    // inputs drop the decimal point when typed char-by-char.
    const maxBalance = Math.max(1, Math.min(Math.floor(remaining), 100000) - 1);
    const newBalance = String(randInt(1, maxBalance));
    const newLimit = String(randInt(1, 99999));

    await fillMaskedInput(cardholders.balanceInput, newBalance);
    await fillMaskedInput(cardholders.limitInput, newLimit);

    // ── Save: the top-up is within limits, so the edit form closes on success ──
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0, { timeout: 10_000 });

    // ── Verify the new values persisted ──────────────────────────────────────
    await page.getByRole('button', { name: 'Edit' }).first().click();
    // Values display with thousands separators and may gain a trailing ".00"
    const asFormatted = (n: string) =>
      new RegExp('^' + Number(n).toLocaleString('en-US').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.00)?$');
    await expect(cardholders.balanceInput).toHaveValue(asFormatted(newBalance));
    await expect(cardholders.limitInput).toHaveValue(asFormatted(newLimit));
  });

});

// ── TC-042: Balance over max limit (negative) ───────────────────────────────────
test.describe('TC-042 | Cardholder balance exceeds max', () => {
  test.setTimeout(45_000);

  test('TC-042 | Shows error when Cardholder Balance exceeds $100,000', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    await cardholders.openFirstCardholderEdit();

    const overBalance = String(randInt(100001, 999999)); // exceeds $100,000 max
    await fillMaskedInput(cardholders.balanceInput, overBalance);

    // ── Save → validation error, form stays open ─────────────────────────────
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.locator('[role="alert"]:visible', { hasText: 'The Cardholder Balance must not exceed $100,000.00' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Save' }).first()).toBeVisible();
  });

});

// ── TC-043: Balance over remaining balance (negative) ───────────────────────────
test.describe('TC-043 | Cardholder balance exceeds remaining balance', () => {
  test.setTimeout(45_000);
  // Wide viewport so the "Remaining Balance" metric renders in full (not truncated)
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('TC-043 | Shows error when Cardholder Balance exceeds the account remaining balance', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    await cardholders.openFirstCardholderEdit();
    const remaining = await cardholders.readRemainingBalance();

    const current = parseFloat((await cardholders.balanceInput.inputValue()).replace(/[$,]/g, '')) || 0;

    // A value that draws more than the remaining balance (current + remaining + buffer),
    // while staying under the $100,000 hard cap so we isolate the remaining-balance error.
    const overBalance = String(Math.min(99999, Math.ceil(current + remaining) + 1000));
    await fillMaskedInput(cardholders.balanceInput, overBalance);

    // ── Save → validation error, form stays open ─────────────────────────────
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.locator('[role="alert"]:visible', { hasText: 'The Cardholder Balance must not exceed the remaining balance' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Save' }).first()).toBeVisible();
  });

});
