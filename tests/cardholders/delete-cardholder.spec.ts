import { test, expect } from '../../src/fixtures/test';
import { CardholdersPage } from '../../src/pages/CardholdersPage';
import { makeCardholder } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-072  Cardholders — Delete Cardholder
//
// Creates a fresh Virtual cardholder (so the test is self-contained and never
// deletes a cardholder other tests rely on), then: view (expand row) → Edit →
// Delete Cardholder → Confirm. Asserts the success toast and that the
// cardholder disappears from the Cardholders list.
//
// Names are random per run (digit-free, Airwallex-safe). A fixed name used to
// cause strict-mode failures whenever an earlier failed run left its
// cardholder behind.
//
// Auth: yacht-admin storageState
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TC-072 | Delete Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-072 | Creates a cardholder then deletes it, verifying removal from the list', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    const data = makeCardholder('100.00');
    const fullName = `${data.firstName} ${data.lastName}`;

    // ── Create a Virtual cardholder to delete ────────────────────────────────
    await cardholders.open();
    await cardholders.openAddCardholderDrawer('Virtual');
    await cardholders.fillPersonalDetails(data);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('successfully', { exact: false })).toBeVisible({ timeout: 60_000 });

    // ── Locate the newly created cardholder ──────────────────────────────────
    await page.reload();
    await cardholders.waitForListLoaded();
    await cardholders.search(data.firstName);
    const row = cardholders.expandButtonFor(fullName);
    // The row appears once the just-created cardholder becomes searchable —
    // toBeVisible retries through the search debounce and backend lag.
    await expect(row).toBeVisible({ timeout: 20_000 });

    // ── View → Edit → Delete Cardholder → Confirm ────────────────────────────
    await row.click();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('button', { name: 'Delete Cardholder' }).click();

    await expect(page.getByRole('heading', { name: 'Remove Cardholder' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Are you sure you want to remove ${fullName} from this account?`, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // ── Success ──────────────────────────────────────────────────────────────
    await expect(page.getByText('SUCCESS').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`You have successfully removed ${fullName} from this account.`)).toBeVisible();

    // ── Cardholder no longer appears in the list ─────────────────────────────
    // Wait for the list to demonstrably load (other rows render) before
    // asserting absence — the old reload+sleep+count check passed even when
    // the list hadn't loaded at all.
    await page.reload();
    await cardholders.waitForListLoaded();
    await cardholders.search(data.firstName);
    await expect(cardholders.expandButtonFor(fullName)).toHaveCount(0, { timeout: 10_000 });
  });

});
