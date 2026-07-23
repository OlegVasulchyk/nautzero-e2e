import { test, expect, type Page } from '@playwright/test';
import { STAGING_OTP } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// TC-064  Cardholder (Physical card) — Dashboard actions:
//         View PIN, Unfreeze, Freeze, View Card Details
// TC-065  Cardholder (Virtual card) — Dashboard actions:
//         Unfreeze, Freeze, View Card Details  (virtual cards have no PIN)
//
// Auth: cardholder-physical / cardholder-virtual storageState.
// The describe titles contain "Physical" / "Virtual"; the config projects use
// `grep` to run each describe under the matching cardholder account.
// ─────────────────────────────────────────────────────────────────────────────

/** Enter the static staging OTP into the 6 single-digit inputs and submit. */
async function pass2FA(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(STAGING_OTP[i]);
  }
  await page.getByRole('button', { name: 'Submit' }).click();
}

/** Dismiss an open reveal modal (PIN / card details). */
async function closeModal(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: /close/i }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press('Escape');
  }
}

/** Freeze then unfreeze the card, leaving it Active. State-independent. */
async function freezeUnfreezeCycle(page: Page): Promise<void> {
  // Normalize to Active (unfreeze if currently frozen)
  const unfreeze = page.getByRole('button', { name: 'Unfreeze', exact: true });
  if (await unfreeze.isVisible().catch(() => false)) {
    await unfreeze.click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
  }

  // Freeze
  await page.getByRole('button', { name: 'Freeze', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('button', { name: 'Unfreeze', exact: true })).toBeVisible({ timeout: 15_000 });

  // Unfreeze
  await page.getByRole('button', { name: 'Unfreeze', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Open "View Card Details", pass 2FA, assert the secure reveal modal, close it. */
async function viewCardDetails(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'View Card Details' }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your Full Card Details' })).toBeVisible({ timeout: 10_000 });
  await pass2FA(page);
  await expect(page.getByRole('heading', { name: "Here's Your Full Card Details" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[src*="airwallex.com"][src*="/details"]')).toBeAttached();
  await closeModal(page);
}

// ── TC-064: Physical card cardholder ────────────────────────────────────────────
test.describe('TC-064 | Cardholder Physical card — dashboard actions', () => {
  test.setTimeout(90_000);

  test('TC-064 | Physical: View PIN, Freeze/Unfreeze, View Card Details', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // ── View PIN (physical cards only) ───────────────────────────────────────
    await page.getByRole('button', { name: 'PIN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Verify Your Identity to View Your PIN' })).toBeVisible({ timeout: 10_000 });
    await pass2FA(page);
    await expect(page.getByRole('heading', { name: "Here's Your PIN" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[src*="airwallex.com"][src*="/pin"]')).toBeAttached();
    await closeModal(page);

    // ── Freeze / Unfreeze ────────────────────────────────────────────────────
    await freezeUnfreezeCycle(page);

    // ── View Card Details ────────────────────────────────────────────────────
    await viewCardDetails(page);
  });

});

// ── TC-065: Virtual card cardholder ─────────────────────────────────────────────
test.describe('TC-065 | Cardholder Virtual card — dashboard actions', () => {
  test.setTimeout(90_000);

  test('TC-065 | Virtual: Freeze/Unfreeze, View Card Details', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('My Card:', { exact: false })).toBeVisible({ timeout: 15_000 });

    // ── Freeze / Unfreeze ────────────────────────────────────────────────────
    await freezeUnfreezeCycle(page);

    // ── View Card Details ────────────────────────────────────────────────────
    await viewCardDetails(page);
  });

});
