import { test, expect, type Page } from '@playwright/test';
import { pickRandomOptionFromButton } from '../../src/helpers/ui.helper';
import { randInt, randEmail, uniqueFirstName, uniqueLastName } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-066  Fleet — Create New Boat (USD account)
// TC-067  Fleet — Create New Boat (EUR account)
//
// Both tests run the same "Add A New Boat" flow. The Yacht Manager Admin picks
// USD or EUR on the post-2FA "Select Your Account" screen at login (see
// src/fixtures/users.ts — 'yacht-manager-admin' vs 'yacht-manager-admin-eur'),
// and every boat created afterwards belongs to that currency's Fleet account.
// Config projects run this file twice — once per currency — via `grep` on the
// "USD"/"EUR" describe title, each with its own storageState.
//
// Auth: yacht-manager-admin.json (USD) / yacht-manager-admin-eur.json (EUR)
// ─────────────────────────────────────────────────────────────────────────────

function randPhone() {
  // Ofcom-reserved UK "drama" mobile range (07700 900000–07700 900999) — always
  // valid format & allocation. Arbitrary prefixes are unreliable here: e.g.
  // 447678xxxxxx failed to persist server-side (captain's phone came back null
  // in the backend user entity) while 447718xxxxxx worked, so we stick to this
  // dedicated test range instead of guessing which prefixes are safe.
  const suffix = String(randInt(0, 999)).padStart(3, '0');
  return `7700900${suffix}`;
}

function buildBoatData() {
  const rnd = randInt(100000, 999999);
  return {
    boatName:    `E2E-Boat-${rnd}`,
    companyName: `E2E-Co-${rnd}`,
    // Digit-free captain names (Airwallex name validation) from the shared factory.
    firstName:   uniqueFirstName(),
    lastName:    uniqueLastName(),
    phone:       randPhone(),
    email:       randEmail(),
  };
}
type BoatData = ReturnType<typeof buildBoatData>;

/**
 * Full "Add A New Boat" flow: open the drawer, fill in boat + captain details,
 * confirm the review screen values, submit, and assert the success toast.
 */
async function createBoat(page: Page, data: BoatData): Promise<{ boatType: string; boatSize: string }> {
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Fleet' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a New Boat' }).click();
  await expect(page.getByRole('dialog', { name: 'Add A New Boat' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Boat Name' }).fill(data.boatName);
  await page.getByRole('textbox', { name: 'Boat Company Name' }).fill(data.companyName);

  const boatType = await pickRandomOptionFromButton(page, 'Boat Type');
  const boatSize = await pickRandomOptionFromButton(page, 'Boat Size');

  await page.getByRole('textbox', { name: "Captain's First Name" }).fill(data.firstName);
  await page.getByRole('textbox', { name: "Captain's Last Name" }).fill(data.lastName);
  await page.getByRole('textbox', { name: "Captain's Mobile Number" }).fill(data.phone);
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

  return { boatType, boatSize };
}

// ── TC-066: Create New Boat — USD account ───────────────────────────────────
test.describe('TC-066 | Create New Boat — USD account', () => {
  test.setTimeout(60_000);

  test('TC-066 | Creates a new boat on the USD Fleet account', async ({ page }) => {
    const data = buildBoatData();
    await createBoat(page, data);

    // New boat is listed on the Fleet page
    await expect(page.getByRole('button', { name: new RegExp(`View .*${data.boatName}`) })).toBeVisible({ timeout: 15_000 });
  });
});

// ── TC-067: Create New Boat — EUR account ───────────────────────────────────
test.describe('TC-067 | Create New Boat — EUR account', () => {
  test.setTimeout(60_000);

  test('TC-067 | Creates a new boat on the EUR Fleet account', async ({ page }) => {
    const data = buildBoatData();
    await createBoat(page, data);

    // New boat is listed on the Fleet page
    await expect(page.getByRole('button', { name: new RegExp(`View .*${data.boatName}`) })).toBeVisible({ timeout: 15_000 });
  });
});
