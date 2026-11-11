import { test, expect, type Page } from '../../src/fixtures/test';

// ─────────────────────────────────────────────────────────────────────────────
// TC-068  Fleet — Masquerade as a Yacht (USD account)
// TC-069  Fleet — Masquerade as a Yacht (EUR account)
//
// The Yacht Manager Admin clicks the ship icon on any existing boat's card on
// the Fleet page, confirms the "Are You Sure?" popup, and lands on that boat's
// dashboard as an administrator ("You're Viewing <boat name>").
//
// Auth: yacht-manager-admin.json (USD) / yacht-manager-admin-eur.json (EUR)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Masquerade into the first boat listed on the Fleet page and confirm we land
 * on that boat's dashboard. Returns the boat name for further assertions.
 */
async function masqueradeAsFirstBoat(page: Page): Promise<string> {
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Fleet' })).toBeVisible();

  const boatButton = page.getByRole('button', { name: /^View \d+\.\s/ }).first();
  const label = (await boatButton.getAttribute('aria-label')) ?? '';
  const boatName = label.replace(/^View \d+\.\s*/, '').trim();
  expect(boatName, 'Could not extract boat name from ship icon button').not.toBe('');

  await boatButton.click();

  // ── "Are You Sure?" confirmation popup ──────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Are You Sure?' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`You're about to leave the Fleet page and enter ${boatName} account as an administrator.`)).toBeVisible();

  await page.getByRole('button', { name: 'Confirm' }).click();

  // ── Landed on the boat's dashboard ───────────────────────────────────────
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `You're Viewing ${boatName}` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Go Back To Fleet Page' })).toBeVisible();

  return boatName;
}

// ── TC-068: Masquerade as a Yacht — USD account ──────────────────────────────
test.describe('TC-068 | Masquerade as a Yacht — USD account', () => {
  test('TC-068 | Yacht Manager Admin masquerades as a boat on the USD Fleet account', async ({ page }) => {
    await masqueradeAsFirstBoat(page);
  });
});

// ── TC-069: Masquerade as a Yacht — EUR account ──────────────────────────────
test.describe('TC-069 | Masquerade as a Yacht — EUR account', () => {
  test('TC-069 | Yacht Manager Admin masquerades as a boat on the EUR Fleet account', async ({ page }) => {
    await masqueradeAsFirstBoat(page);
  });
});
