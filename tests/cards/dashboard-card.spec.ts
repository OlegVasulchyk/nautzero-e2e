import { test, expect } from '@playwright/test';
import { STAGING_OTP } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// TC-035  Dashboard — Freeze / Unfreeze own card
// TC-039  Dashboard — View card PIN (requires 2FA)
// TC-040  Dashboard — View full card details (requires 2FA)
//
// Auth: yacht-admin-card storageState (yacht admin who has a physical card)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TC-035 | Dashboard — Freeze / Unfreeze own card', () => {
  test.setTimeout(60_000);

  test('TC-035 | Freezes and unfreezes own card from the dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Card widget is visible
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // Normalize state → if the card is currently frozen, unfreeze it first so we
    // always start from Active (test must not depend on initial card state)
    const unfreezeBtn = page.getByRole('button', { name: 'Unfreeze', exact: true });
    if (await unfreezeBtn.isVisible()) {
      await unfreezeBtn.click();
      await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Yes' }).click();
      await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
    }

    await expect(page.getByText('Active', { exact: true })).toBeVisible();

    // ── Freeze ────────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Freeze', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to freeze this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card should now show Unfreeze button
    await expect(page.getByRole('button', { name: 'Unfreeze', exact: true })).toBeVisible({ timeout: 15_000 });

    // ── Unfreeze ──────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Unfreeze', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to reactivate this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card should be Active again — Freeze button returns
    await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
  });

});

// ── TC-039: View card PIN ──────────────────────────────────────────────────────
test.describe('TC-039 | Dashboard — View card PIN', () => {
  test.setTimeout(60_000);

  test('TC-039 | Opens PIN view, passes 2FA, reveals the PIN', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // ── Open PIN flow ──────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'PIN', exact: true }).click();

    // ── 2FA — enter the static staging OTP ──────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your PIN' })).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(STAGING_OTP[i]);
    }
    await page.getByRole('button', { name: 'Submit' }).click();

    // ── PIN revealed ─────────────────────────────────────────────────────────────
    // The "Here's Your PIN" modal opens; the PIN value itself is rendered inside a
    // secure Airwallex PCI iframe, so we assert the modal + iframe are present
    // rather than reading the digits.
    await expect(page.getByRole('heading', { name: "Here's Your PIN" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[src*="airwallex.com"][src*="/pin"]')).toBeAttached();
  });

});

// ── TC-040: View full card details ─────────────────────────────────────────────
test.describe('TC-040 | Dashboard — View full card details', () => {
  test.setTimeout(60_000);

  test('TC-040 | Opens card details, passes 2FA, reveals full card details', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // ── Open card details flow ───────────────────────────────────────────────────
    await page.getByRole('button', { name: 'View Card Details' }).click();

    // ── 2FA — enter the static staging OTP ──────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your Full Card Details' })).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(STAGING_OTP[i]);
    }
    await page.getByRole('button', { name: 'Submit' }).click();

    // ── Card details revealed ────────────────────────────────────────────────────
    // Full card number / expiry / CVV render inside a secure Airwallex PCI iframe,
    // so we assert the modal + iframe are present rather than reading the values.
    await expect(page.getByRole('heading', { name: "Here's Your Full Card Details" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[src*="airwallex.com"][src*="/details"]')).toBeAttached();
  });

});
