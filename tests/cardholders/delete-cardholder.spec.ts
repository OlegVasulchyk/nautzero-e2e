import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// TC-072  Cardholders — Delete Cardholder
//
// Creates a fresh Virtual cardholder (so the test is self-contained and never
// deletes a cardholder other tests rely on), then: view (expand row) → Edit →
// Delete Cardholder → Confirm. Asserts the success toast and that the
// cardholder disappears from the Cardholders list.
//
// Auth: yacht-admin storageState
// ─────────────────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randPhone() {
  // Valid UK mobile: 07xxxxxxxxx (10 digits local) — prefix 71/72/73/74/75/77/78/79
  const prefixes = ['7121', '7234', '7345', '7456', '7567', '7678', '7789', '7890'];
  const prefix = prefixes[randInt(0, prefixes.length - 1)];
  const suffix = String(randInt(100000, 999999));
  return prefix + suffix;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// No digits — a name with digits fails Airwallex's name validation ("Name can
// only contain letters and spaces."), and each is unique enough on its own
// that this test never collides with a real cardholder.
const FIRST_NAME = 'DeleteFlowAlpha';
const LAST_NAME = 'DeleteFlowOmega';

const CARDHOLDER = {
  firstName:    FIRST_NAME,
  lastName:     LAST_NAME,
  phone:        randPhone(),
  email:        `ov+${randInt(100000, 999999)}@carbonpay.io`,
  dobDay:       String(randInt(1, 28)),
  dobMonth:     MONTHS[randInt(0, 11)],
  dobYear:      String(randInt(1970, 2000)),
  monthlyLimit: '100.00',
};

/** Pick a random department option from the open listbox */
async function pickRandomDepartment(page: Page): Promise<void> {
  const options = page.getByRole('listbox').getByRole('option');
  const count = await options.count();
  if (count === 0) throw new Error('Department listbox has no options');
  await options.nth(randInt(0, count - 1)).click();
}

/** Create a Virtual cardholder via the "Add a Cardholder" flow. */
async function createVirtualCardholder(page: Page, data: typeof CARDHOLDER): Promise<void> {
  await page.goto('/cardholders');
  await expect(page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a Cardholder' }).click();
  await expect(page.getByRole('dialog', { name: 'Order A Cardholder' })).toBeVisible();
  await page.getByRole('button', { name: 'Virtual' }).click();
  await expect(page.getByRole('heading', { name: 'Virtual Card' })).toBeVisible();

  await page.getByLabel('First Name').fill(data.firstName);
  await page.getByLabel('Last Name').fill(data.lastName);
  await page.locator('input[type="tel"]').fill(data.phone);
  await page.getByLabel('Email Address').fill(data.email);

  await page.getByRole('dialog').getByRole('button', { name: 'Department' }).click();
  await pickRandomDepartment(page);

  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('option', { name: data.dobDay, exact: true }).click();
  await page.getByRole('button', { name: 'Month' }).click();
  await page.getByRole('option', { name: data.dobMonth }).click();
  await page.getByRole('button', { name: 'Year' }).click();
  await page.getByRole('option', { name: data.dobYear }).click();

  await page.getByLabel('Set Monthly Card Limit').fill(data.monthlyLimit);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('successfully', { exact: false })).toBeVisible({ timeout: 60_000 });
}

/** Search the Cardholders list by name and return whether a matching row exists. */
async function cardholderRowExists(page: Page, firstName: string): Promise<boolean> {
  await page.goto('/cardholders');
  await expect(page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();
  await page.getByPlaceholder('Search').fill(firstName);
  await page.waitForTimeout(1_500); // debounced search
  return (await page.getByRole('button', { name: new RegExp(`Expand details for ${firstName}`) }).count()) > 0;
}

// ── TC-072: Delete Cardholder ─────────────────────────────────────────────────
test.describe('TC-072 | Delete Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-072 | Creates a cardholder then deletes it, verifying removal from the list', async ({ page }) => {
    await createVirtualCardholder(page, CARDHOLDER);

    // ── Locate the newly created cardholder ─────────────────────────────────
    await page.reload();
    await page.waitForTimeout(2_500); // let the just-created cardholder become searchable
    await page.getByPlaceholder('Search').fill(CARDHOLDER.firstName);
    await page.waitForTimeout(1_500);

    const row = page.getByRole('button', { name: new RegExp(`Expand details for ${CARDHOLDER.firstName}`) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ── View → Edit → Delete Cardholder → Confirm ───────────────────────────
    await row.click();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('button', { name: 'Delete Cardholder' }).click();

    await expect(page.getByRole('heading', { name: 'Remove Cardholder' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Are you sure you want to remove ${CARDHOLDER.firstName} ${CARDHOLDER.lastName} from this account?`, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // ── Success ──────────────────────────────────────────────────────────────
    await expect(page.getByText('SUCCESS').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`You have successfully removed ${CARDHOLDER.firstName} ${CARDHOLDER.lastName} from this account.`)).toBeVisible();

    // ── Cardholder no longer appears in the list ────────────────────────────
    expect(await cardholderRowExists(page, CARDHOLDER.firstName)).toBe(false);
  });

});
