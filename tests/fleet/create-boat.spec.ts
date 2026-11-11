import { test, expect, type Page } from '../../src/fixtures/test';
import { pickRandomOptionFromButton, fillMaskedInput } from '../../src/helpers/ui.helper';
import { randInt, randEmail, randPhone, uniqueFirstName, uniqueLastName } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-066  Fleet — Create New Boat (USD boat)
// TC-067  Fleet — Create New Boat (EUR boat)
//
// Both tests run the same "Add A New Boat" flow and differ only in the
// "Boat Currency" picked in the form. DOM-verified (Nov 2026): the currency is
// a per-boat form field (USD / EUR / GBP) and one Fleet holds boats of every
// currency — there is no separate "USD account" / "EUR account" fleet any more.
// "Boat Currency" and "Billing Frequency" (Monthly / Annual) are required.
//
// Auth: yacht-manager-admin storageState
// ─────────────────────────────────────────────────────────────────────────────

function buildBoatData() {
  const rnd = randInt(100000, 999999);
  return {
    boatName:    `E2E-Boat-${rnd}`,
    companyName: `E2E-Co-${rnd}`,
    // Digit-free captain names (Airwallex name validation) from the shared factory.
    firstName:   uniqueFirstName(),
    lastName:    uniqueLastName(),
    // Shared valid-UK-mobile generator. The Ofcom "drama" range (07700 900xxx)
    // used here before is now rejected by the form ("Enter a valid mobile number.").
    phone:       randPhone(),
    email:       randEmail(),
  };
}
type BoatData = ReturnType<typeof buildBoatData>;

/**
 * Full "Add A New Boat" flow: open the drawer, fill in boat + captain details,
 * confirm the review screen values, submit, and assert the success toast.
 */
async function createBoat(page: Page, data: BoatData, currency: 'USD' | 'EUR'): Promise<void> {
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Fleet' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a New Boat' }).click();
  await expect(page.getByRole('dialog', { name: 'Add A New Boat' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Boat Name' }).fill(data.boatName);
  await page.getByRole('textbox', { name: 'Boat Company Name' }).fill(data.companyName);

  await page.getByRole('button', { name: 'Boat Currency' }).click();
  await page.getByRole('listbox').getByRole('option', { name: currency, exact: true }).click();
  await pickRandomOptionFromButton(page, 'Billing Frequency');

  const boatType = await pickRandomOptionFromButton(page, 'Boat Type');
  const boatSize = await pickRandomOptionFromButton(page, 'Boat Size');

  await page.getByRole('textbox', { name: "Captain's First Name" }).fill(data.firstName);
  await page.getByRole('textbox', { name: "Captain's Last Name" }).fill(data.lastName);
  await fillMaskedInput(page.getByRole('textbox', { name: "Captain's Mobile Number" }), data.phone);
  await page.getByRole('textbox', { name: "Captain's Email Address" }).fill(data.email);

  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Confirm screen — verify every value before submitting ──────────────────
  const confirmDialog = page.getByRole('dialog', { name: 'Add A New Boat' });
  await expect(confirmDialog.getByText("Please make sure you've checked all details thoroughly before confirming")).toBeVisible({ timeout: 10_000 });
  await expect(confirmDialog.getByText(data.boatName, { exact: true })).toBeVisible();
  await expect(confirmDialog.getByText(data.companyName, { exact: true })).toBeVisible();
  await expect(confirmDialog.getByText(boatType, { exact: true })).toBeVisible();
  await expect(confirmDialog.getByText(boatSize, { exact: true })).toBeVisible();
  await expect(confirmDialog.getByText(`${data.firstName} ${data.lastName}`, { exact: true })).toBeVisible();
  await expect(confirmDialog.getByText(new RegExp(data.phone))).toBeVisible();
  await expect(confirmDialog.getByText(data.email, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Confirm' }).click();

  // ── Success ──────────────────────────────────────────────────────────────
  await expect(page.getByText(`${data.boatName} has been added to your fleet.`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Add A New Boat' })).not.toBeVisible({ timeout: 10_000 });

  // New boat is listed on the Fleet page, in the chosen currency. Search first:
  // the fleet holds many boats.
  await page.getByRole('searchbox', { name: 'Search Boat Name' }).fill(data.boatName);
  const card = page.getByRole('article').filter({ hasText: data.boatName });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(currency, { exact: true })).toBeVisible();
}

for (const { tc, currency } of [
  { tc: 'TC-066', currency: 'USD' },
  { tc: 'TC-067', currency: 'EUR' },
] as const) {
  test.describe(`${tc} | Create New Boat — ${currency} boat`, () => {
    test.setTimeout(60_000);

    test(`${tc} | Creates a new ${currency} boat on the Fleet`, async ({ page }) => {
      await createBoat(page, buildBoatData(), currency);
    });
  });
}
