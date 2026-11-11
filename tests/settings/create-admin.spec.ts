import { test, expect, type Page } from '../../src/fixtures/test';

// ─────────────────────────────────────────────────────────────────────────────
// TC-070  Settings/Admins — Create New Admin (USD account)
// TC-071  Settings/Admins — Create New Admin (EUR account)
//
// Both tests run the same "Add an Administrator" flow, picking United States
// as the mobile country code. Config projects run this file twice — once per
// currency — via `grep` on the "USD"/"EUR" describe title, each with its own
// storageState, same pattern as tests/fleet/create-boat.spec.ts.
//
// Auth: yacht-manager-admin.json (USD) / yacht-manager-admin-eur.json (EUR)
// ─────────────────────────────────────────────────────────────────────────────

import { randInt, randEmail, uniqueFirstName, uniqueLastName } from '../../src/fixtures/test-data';
import { fillMaskedInput } from '../../src/helpers/ui.helper';

// NANP-reserved fictional range (area code + 555-01xx) — always valid format,
// never a real subscriber number.
const US_AREA_CODES = ['201', '213', '305', '415', '512', '617', '702', '818'];

function buildAdminData() {
  // Reserved suffix is "01" + 2 digits (0100–0199) — 4 digits total, giving a
  // full 10-digit number (area code + 555 + suffix), matching real US format.
  const suffix = `01${String(randInt(0, 99)).padStart(2, '0')}`;
  return {
    // Digit-free, run-unique names from the shared factory (Airwallex-safe; the
    // tag suffix also keeps the final name-in-list check unambiguous).
    firstName: uniqueFirstName(),
    lastName:  uniqueLastName(),
    phone:     `${US_AREA_CODES[randInt(0, US_AREA_CODES.length - 1)]}555${suffix}`,
    email:     randEmail(),
  };
}
type AdminData = ReturnType<typeof buildAdminData>;

/**
 * Full "Add an Administrator" flow: open the drawer, pick United States as
 * the mobile country code, fill in the admin's details, submit, and assert
 * the success toast plus the new admin appearing in the list.
 */
async function createAdmin(page: Page, data: AdminData): Promise<void> {
  await page.goto('/settings/admins');
  await expect(page.getByRole('heading', { name: 'Administrators' })).toBeVisible();

  await page.getByRole('button', { name: 'Add an Administrator' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a new administrator' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: /Country code/ }).click();
  const usOption = page.getByRole('option', { name: /United States/ });
  await usOption.scrollIntoViewIfNeeded();
  await usOption.click();

  await dialog.getByPlaceholder('First name').fill(data.firstName);
  await dialog.getByPlaceholder('Last name').fill(data.lastName);

  // Masked input — .fill() bypasses the keystroke handlers the mask needs to
  // format progressively. (DOM-verified: the field is labelled "Mobile Number".)
  await fillMaskedInput(dialog.getByRole('textbox', { name: 'Mobile Number' }), data.phone);

  await dialog.getByPlaceholder('Email address').fill(data.email);

  await dialog.getByRole('button', { name: 'Submit' }).click();

  // Step 2 (DOM-verified Nov 2026): a notification-preference screen with an
  // Enabled/Disabled switch and a second Submit. Keep the default and submit.
  await expect(dialog.getByText('Would you like to enable this administrator to receive messages', { exact: false })).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Submit' }).click();

  // Step 3 (DOM-verified Nov 2026): "Require Secondary Approval?" — another
  // Enabled/Disabled switch and the final Submit. Keep the default.
  await expect(dialog.getByRole('heading', { name: 'Require Secondary Approval?' })).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Submit' }).click();

  // ── Success ──────────────────────────────────────────────────────────────
  // Staging's SMTP host (hello@nautzero.com) is slow/times out, so the submit
  // request stays in "Submitting..." well past a normal request — give it room.
  await expect(page.getByText('SUCCESS').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('The new admin you’ve created has been added to your account. We have notified them via email with their unique login details.')).toBeVisible();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // New admin is listed on the Admins page
  await expect(page.getByText(`${data.firstName} ${data.lastName}`, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

// ── TC-070: Create New Admin — USD account ───────────────────────────────────
test.describe('TC-070 | Create New Admin — USD account', () => {
  test.setTimeout(90_000);

  test('TC-070 | Yacht Manager Admin creates a new admin on the USD account', async ({ page }) => {
    const data = buildAdminData();
    await createAdmin(page, data);
  });
});

// ── TC-071: Create New Admin — EUR account ───────────────────────────────────
test.describe('TC-071 | Create New Admin — EUR account', () => {
  test.setTimeout(90_000);

  test('TC-071 | Yacht Manager Admin creates a new admin on the EUR account', async ({ page }) => {
    const data = buildAdminData();
    await createAdmin(page, data);
  });
});
