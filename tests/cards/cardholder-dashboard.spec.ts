import { test, expect, type Page } from '../../src/fixtures/test';
import { STAGING_OTP } from '../../src/fixtures/users';
import { enterOtp, closeRevealModal } from '../../src/helpers/ui.helper';

// ─────────────────────────────────────────────────────────────────────────────
// TC-064  Cardholder (Physical card) — Dashboard actions:
//         View PIN, Unfreeze, Freeze, View Card Details
// TC-065  Cardholder (Virtual card) — Dashboard actions:
//         Unfreeze, Freeze, View Card Details  (virtual cards have no PIN)
//
// Card state drives availability (read from the "Status:" value in the widget):
//   • Status: Active  → Freeze / PIN / View Card Details are available
//   • Status: Frozen  → only Unfreeze is available; unfreeze first, then proceed
//
// Auth: cardholder-physical / cardholder-virtual storageState. The describe titles
// contain "Physical" / "Virtual"; config projects use `grep` to run each under the
// matching cardholder account.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the card is Active. Waits for the Status value to render first (an
 * immediate isVisible() used to race the widget), then unfreezes if Frozen.
 */
async function ensureCardActive(page: Page): Promise<void> {
  const active = page.getByText('Active', { exact: true });
  const frozen = page.getByText('Frozen', { exact: true });
  await expect(active.or(frozen).first()).toBeVisible({ timeout: 15_000 });

  if (await frozen.isVisible()) {
    await page.getByRole('button', { name: 'Unfreeze', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Yes' }).click();
  }
  await expect(active).toBeVisible({ timeout: 15_000 });
}

/** Freeze an active card, then unfreeze it back to Active. Each step is confirmed by
 *  its SUCCESS notification before the test is considered passed. */
async function freezeThenUnfreeze(page: Page): Promise<void> {
  await ensureCardActive(page);

  // Freeze → success toast + Status becomes Frozen
  await page.getByRole('button', { name: 'Freeze', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('The card you have selected is now frozen.').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Frozen', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Unfreeze → success toast + Status back to Active
  await page.getByRole('button', { name: 'Unfreeze', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('The card you have selected is now active.').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Open "View Card Details" (card must be Active), pass 2FA, assert reveal, close. */
async function viewCardDetails(page: Page): Promise<void> {
  await ensureCardActive(page);
  await page.getByRole('button', { name: 'View Card Details' }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your Full Card Details' })).toBeVisible({ timeout: 10_000 });
  await enterOtp(page, STAGING_OTP, 'Submit');
  await expect(page.getByRole('heading', { name: "Here's Your Full Card Details" })).toBeVisible({ timeout: 15_000 });
  // Wait until the secure Airwallex iframe has actually rendered the card data
  const detailsFrame = page.frameLocator('iframe[src*="airwallex.com"][src*="/details"]');
  await expect(detailsFrame.locator('body')).toContainText(/\d/, { timeout: 20_000 });
  await closeRevealModal(page);
}

/** Open "PIN" (card must be Active), pass 2FA, assert reveal, close. */
async function viewPin(page: Page): Promise<void> {
  await ensureCardActive(page);
  await page.getByRole('button', { name: 'PIN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your PIN' })).toBeVisible({ timeout: 10_000 });
  await enterOtp(page, STAGING_OTP, 'Submit');
  await expect(page.getByRole('heading', { name: "Here's Your PIN" })).toBeVisible({ timeout: 15_000 });
  // Wait until the secure Airwallex iframe has actually rendered the PIN digits
  const pinFrame = page.frameLocator('iframe[src*="airwallex.com"][src*="/pin"]');
  await expect(pinFrame.locator('body')).toContainText(/\d/, { timeout: 20_000 });
  await closeRevealModal(page);
}

/** Wait for the cardholder dashboard card widget to load. */
async function gotoCardWidget(page: Page): Promise<void> {
  await page.goto('/dashboard');
  // Cardholder card widget has no "My Card:" label — it shows "Available Cardholder Balance:"
  await expect(page.getByText('Available Cardholder Balance:', { exact: false })).toBeVisible({ timeout: 15_000 });
}

// ── TC-064: Physical card cardholder ────────────────────────────────────────────
test.describe('TC-064 | Cardholder Physical card — dashboard actions', () => {
  test.setTimeout(90_000);

  test('TC-064 | Physical: View PIN, Freeze/Unfreeze, View Card Details', async ({ page }) => {
    await gotoCardWidget(page);

    await viewPin(page);          // physical cards expose a PIN
    await freezeThenUnfreeze(page);
    await viewCardDetails(page);
  });

});

// ── TC-065: Virtual card cardholder ─────────────────────────────────────────────
test.describe('TC-065 | Cardholder Virtual card — dashboard actions', () => {
  test.setTimeout(90_000);

  test('TC-065 | Virtual: Freeze/Unfreeze, View Card Details', async ({ page }) => {
    await gotoCardWidget(page);

    await freezeThenUnfreeze(page);
    await viewCardDetails(page);
  });

});
