import { test, expect } from '@playwright/test';
import { STAGING_OTP } from '../../src/fixtures/users';
import { enterOtp, closeRevealModal } from '../../src/helpers/ui.helper';

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
    // always start from Active (test must not depend on initial card state).
    // Wait for the action buttons to render before branching — an immediate
    // isVisible() used to race the widget and could mis-detect the state.
    const freezeBtn = page.getByRole('button', { name: 'Freeze', exact: true });
    const unfreezeBtn = page.getByRole('button', { name: 'Unfreeze', exact: true });
    await expect(freezeBtn.or(unfreezeBtn)).toBeVisible({ timeout: 15_000 });
    if (await unfreezeBtn.isVisible()) {
      await unfreezeBtn.click();
      await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Yes' }).click();
      await expect(freezeBtn).toBeVisible({ timeout: 15_000 });
    }

    await expect(page.getByText('Active', { exact: true })).toBeVisible();

    // ── Freeze ────────────────────────────────────────────────────────────────
    await freezeBtn.click();
    await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to freeze this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card should now show Unfreeze button
    await expect(unfreezeBtn).toBeVisible({ timeout: 15_000 });

    // ── Unfreeze ──────────────────────────────────────────────────────────────
    await unfreezeBtn.click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to reactivate this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card should be Active again — Freeze button returns
    await expect(freezeBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
  });

});

// ── TC-039: View card PIN ──────────────────────────────────────────────────────
test.describe('TC-039 | Dashboard — View card PIN', () => {
  test.setTimeout(60_000);

  test('TC-039 | Opens PIN view, passes 2FA, reveals the PIN', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // PIN is only available on an Active card — the widget normalizes via TC-035,
    // but don't depend on test order: unfreeze first if needed.
    const unfreezeBtn = page.getByRole('button', { name: 'Unfreeze', exact: true });
    if (await unfreezeBtn.isVisible().catch(() => false)) {
      await unfreezeBtn.click();
      await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Yes' }).click();
      await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
    }

    // ── Open PIN flow ──────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'PIN', exact: true }).click();

    // ── 2FA — enter the static staging OTP ──────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your PIN' })).toBeVisible({ timeout: 10_000 });
    await enterOtp(page, STAGING_OTP, 'Submit');

    // ── PIN revealed ─────────────────────────────────────────────────────────────
    // The PIN renders inside a secure cross-origin Airwallex PCI iframe — plain
    // page JS is blocked, so "data loaded" = digits appear inside the frame body.
    await expect(page.getByRole('heading', { name: "Here's Your PIN" })).toBeVisible({ timeout: 15_000 });
    const pinFrame = page.frameLocator('iframe[src*="airwallex.com"][src*="/pin"]');
    await expect(pinFrame.locator('body')).toContainText(/\d/, { timeout: 20_000 });
    await closeRevealModal(page);
  });

});

// ── TC-040: View full card details ─────────────────────────────────────────────
test.describe('TC-040 | Dashboard — View full card details', () => {
  test.setTimeout(60_000);

  test('TC-040 | Opens card details, passes 2FA, reveals full card details', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // Card details are only available on an Active card — normalize first.
    const unfreezeBtn = page.getByRole('button', { name: 'Unfreeze', exact: true });
    if (await unfreezeBtn.isVisible().catch(() => false)) {
      await unfreezeBtn.click();
      await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Yes' }).click();
      await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
    }

    // ── Open card details flow ───────────────────────────────────────────────────
    await page.getByRole('button', { name: 'View Card Details' }).click();

    // ── 2FA — enter the static staging OTP ──────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your Full Card Details' })).toBeVisible({ timeout: 10_000 });
    await enterOtp(page, STAGING_OTP, 'Submit');

    // ── Card details revealed ────────────────────────────────────────────────────
    // Full card number / expiry / CVV render inside a secure Airwallex PCI iframe —
    // assert the digits actually appear inside the frame body, then close.
    await expect(page.getByRole('heading', { name: "Here's Your Full Card Details" })).toBeVisible({ timeout: 15_000 });
    const detailsFrame = page.frameLocator('iframe[src*="airwallex.com"][src*="/details"]');
    await expect(detailsFrame.locator('body')).toContainText(/\d/, { timeout: 20_000 });
    await closeRevealModal(page);
  });

});
