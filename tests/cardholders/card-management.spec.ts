import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// TC-036  Cardholders — Freeze / Unfreeze cardholder's card
// TC-037  Cardholders — Replace card (physical; 14-day restriction applies)
// TC-038  Cardholders — Cancel card
// TC-041  Cardholders — Edit Cardholder Balance & Monthly Card Limit
//
// Auth: yacht-admin storageState
// ─────────────────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randAmount(min: number, max: number) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

const SHIPPING = {
  street:   '15 Snape Hill',
  city:     'Dronfield',
  region:   'Bradford',
  postcode: 'S18 2GH',
};

/**
 * Expand the first cardholder that has an ACTIVE card and leave its row open.
 * Cancelled cards render a disabled "Freeze unavailable for this card" button, so we
 * look for an enabled exact-"Freeze" (active) or "Unfreeze" (frozen) action instead.
 */
/** Whether the currently expanded row's leading icon is a Physical card (vs Virtual). */
async function expandedRowIsPhysical(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const collapse = document.querySelector('button[aria-label^="Collapse details for"]');
    const row = collapse?.closest('tr') ?? collapse?.closest('[role="row"]');
    const img = row?.querySelector('td img, [role="cell"] img') as HTMLImageElement | null;
    const src = decodeURIComponent(img?.getAttribute('src') ?? '');
    // Physical card icon renders at 31×25; the virtual (cloud) icon renders at 30×22
    return /width='31'/.test(src) && /height='25'/.test(src);
  });
}

async function expandActiveCardholder(
  page: Page,
  opts: { requireReplace?: boolean; requirePhysical?: boolean } = {}
): Promise<void> {
  await page.goto('/cardholders');
  await expect(page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();

  // Wait for the cardholder rows to finish loading (skeleton → real rows)
  await page.getByRole('button', { name: /Expand details for/ }).first().waitFor({ state: 'visible', timeout: 20_000 });

  const total = await page.getByRole('button', { name: /Expand details for/ }).count();
  for (let i = 0; i < total; i++) {
    // All rows collapsed at the top of each iteration → indices are stable
    await page.getByRole('button', { name: /Expand details for/ }).nth(i).click();

    // A card is actionable only when Freeze (active) or Unfreeze (frozen) is present
    // AND enabled. Cancelled/deleted cards render these buttons disabled (or with an
    // "…unavailable…" label), so we must check enabled state, not just presence.
    const freeze   = page.getByRole('button', { name: 'Freeze', exact: true }).first();
    const unfreeze = page.getByRole('button', { name: 'Unfreeze', exact: true }).first();
    const freezeActive   = (await freeze.count()) > 0 && (await freeze.isEnabled());
    const unfreezeActive = (await unfreeze.count()) > 0 && (await unfreeze.isEnabled());
    let ok = freezeActive || unfreezeActive;

    // Replace is blocked for 14 days after a replacement — require it enabled when asked
    if (ok && opts.requireReplace) {
      const replace = page.getByRole('button', { name: 'Replace', exact: true }).first();
      ok = (await replace.count()) > 0 && (await replace.isEnabled());
    }

    // Only physical cards show the shipping-address form on replace (virtual replaces
    // instantly), so the replace test must land on a physical card.
    if (ok && opts.requirePhysical) {
      ok = await expandedRowIsPhysical(page);
    }

    if (ok) {
      return; // found a suitable card — leave this row expanded
    }

    // Not suitable → collapse and try the next row
    await page.getByRole('button', { name: /Collapse details for/ }).click();
  }
  throw new Error('No cardholder with a suitable active card found on this page');
}

// ── TC-036: Freeze / Unfreeze ─────────────────────────────────────────────────
test.describe('TC-036 | Freeze / Unfreeze cardholder card', () => {
  test.setTimeout(60_000);

  test('TC-036 | Freezes and unfreezes a cardholder card from Cardholders page', async ({ page }) => {
    await expandActiveCardholder(page);

    // Normalize state → if the card is currently frozen, unfreeze it first so we
    // always start from Active (test must not depend on initial card state)
    const preUnfreeze = page.getByRole('button', { name: 'Unfreeze', exact: true }).first();
    if (await preUnfreeze.isVisible()) {
      await preUnfreeze.click();
      await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Yes' }).click();
      await expect(page.getByRole('button', { name: 'Freeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }

    // ── Freeze ──────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Freeze', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Freeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to freeze this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Freeze button changes to Unfreeze
    await expect(page.getByRole('button', { name: 'Unfreeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // ── Unfreeze ─────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Unfreeze', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to reactivate this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Unfreeze button changes back to Freeze
    await expect(page.getByRole('button', { name: 'Freeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

});

// ── TC-037: Replace Card ──────────────────────────────────────────────────────
test.describe('TC-037 | Replace cardholder card', () => {
  test.setTimeout(120_000);

  // NOTE: replacement can only be requested once every 14 days per card.

  test('TC-037 | Replaces a cardholder physical card and provides shipping address', async ({ page }) => {
    await expandActiveCardholder(page, { requireReplace: true, requirePhysical: true });

    // ── Confirm replace ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Replace', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Replace Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to replace this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // ── Shipping address form ────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Order My Replacement Card' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('textbox', { name: 'Street Address', exact: true }).fill(SHIPPING.street);
    await page.getByLabel('City / Town').fill(SHIPPING.city);
    await page.getByRole('button', { name: /state.*region/i }).click();
    await page.getByRole('option', { name: SHIPPING.region, exact: true }).click();
    await page.getByLabel('Postcode').fill(SHIPPING.postcode);

    await page.getByRole('button', { name: 'Continue' }).click();

    // ── Confirm screen ───────────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Confirm Replacement Card Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Success — confirm screen closes after submission
    await expect(page.getByRole('heading', { name: 'Confirm Replacement Card Details' })).not.toBeVisible({ timeout: 60_000 });
  });

});

// ── TC-038: Cancel Card ───────────────────────────────────────────────────────
test.describe('TC-038 | Cancel cardholder card', () => {
  test.setTimeout(60_000);

  test('TC-038 | Cancels a cardholder card with confirmation', async ({ page }) => {
    await expandActiveCardholder(page);

    // ── Cancel ───────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Cancel Card' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Are you sure you want to cancel this card?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    // Card cancelled — confirmation closes
    await expect(page.getByRole('heading', { name: 'Cancel Card' })).not.toBeVisible({ timeout: 15_000 });
  });

});

/**
 * Read the account "Remaining Balance" value (in dollars) from the Cardholders page.
 * The metric value can be visually truncated on narrow viewports, so this climbs to
 * the metric column and pulls the full "$x,xxx.xx" string from the DOM.
 */
async function getRemainingBalance(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const label = [...document.querySelectorAll('p,span,div')].find(
      (e) => e.textContent?.trim() === 'Remaining Balance:'
    );
    if (!label) return 0;
    let c: Element | null = label.closest('div');
    for (let i = 0; i < 6 && c; i++) {
      const m = [...c.querySelectorAll('*')]
        .map((e) => e.textContent?.trim() ?? '')
        .find((t) => /^\$[\d,]+\.\d{2}$/.test(t));
      if (m) return parseFloat(m.replace(/[$,]/g, ''));
      c = c.parentElement;
    }
    return 0;
  });
}

/** Open the Edit form of the first cardholder that has an active card */
async function openFirstCardholderEdit(page: Page): Promise<void> {
  await expandActiveCardholder(page);

  // If frozen, unfreeze first so we edit an active card
  const preUnfreeze = page.getByRole('button', { name: 'Unfreeze', exact: true }).first();
  if (await preUnfreeze.isVisible()) {
    await preUnfreeze.click();
    await expect(page.getByRole('heading', { name: 'Unfreeze Card' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByRole('button', { name: 'Freeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }

  await page.getByRole('button', { name: 'Edit' }).first().click();
}

// Formatted amount inputs (thousands separators). Scope to :visible to skip hidden
// duplicates from collapsed rows. Note: these inputs drop the decimal point when
// typed char-by-char, so we use whole-dollar integer amounts.
const balanceSelector = 'input[aria-label="Cardholder Balance"]:visible';
const limitSelector   = 'input[aria-label="Monthly Card Limit:"]:visible';

// ── TC-041: Edit Balance & Monthly Limit (positive) ─────────────────────────────
test.describe('TC-041 | Edit cardholder balance & monthly limit', () => {
  test.setTimeout(30_000);
  // Wide viewport so the "Remaining Balance" metric renders in full (not truncated)
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('TC-041 | Edits Cardholder Balance and Monthly Card Limit on an active card', async ({ page }) => {
    await openFirstCardholderEdit(page);
    await page.waitForTimeout(1_000); // let the balances metric settle/render fully
    const remaining = await getRemainingBalance(page);

    // Balance top-up must not exceed the account remaining balance, and is capped at
    // $100,000. Stay safely below both limits.
    const maxBalance = Math.max(1, Math.min(Math.floor(remaining), 100000) - 1);
    const newBalance = String(randInt(1, maxBalance));
    const newLimit   = String(randInt(1, 99999));    // 1 – 99999

    // Guard: the top-up amount must be within the account remaining balance
    expect(Number(newBalance)).toBeLessThanOrEqual(remaining);

    const balanceInput = page.locator(balanceSelector);
    const limitInput   = page.locator(limitSelector);

    await balanceInput.click();
    await balanceInput.fill('');
    await balanceInput.pressSequentially(newBalance);
    await balanceInput.blur();

    await limitInput.click();
    await limitInput.fill('');
    await limitInput.pressSequentially(newLimit);
    await limitInput.blur();

    // ── Save ───────────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Save' }).first().click();

    // No "exceeds remaining balance" / "exceeds $100,000" validation errors — the
    // top-up was within limits, so the edit form closes on success.
    await expect(page.locator('[role="alert"]:visible', { hasText: 'The Cardholder Balance must not exceed' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0, { timeout: 10_000 });

    // ── Verify the new values persisted ──────────────────────────────────────────
    await page.getByRole('button', { name: 'Edit' }).first().click();
    // Values display with thousands separators and may gain a trailing ".00"
    const asFormatted = (n: string) =>
      new RegExp('^' + Number(n).toLocaleString('en-US').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.00)?$');
    await expect(balanceInput).toHaveValue(asFormatted(newBalance));
    await expect(limitInput).toHaveValue(asFormatted(newLimit));
  });

});

// ── TC-042: Balance over max limit (negative) ───────────────────────────────────
test.describe('TC-042 | Cardholder balance exceeds max', () => {
  test.setTimeout(20_000);

  test('TC-042 | Shows error when Cardholder Balance exceeds $100,000', async ({ page }) => {
    await openFirstCardholderEdit(page);

    const overBalance = String(randInt(100001, 999999)); // exceeds $100,000 max

    const balanceInput = page.locator(balanceSelector);
    await balanceInput.click();
    await balanceInput.fill('');
    await balanceInput.pressSequentially(overBalance);
    await balanceInput.blur();

    // ── Save → validation error, form stays open ─────────────────────────────────
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.locator('[role="alert"]:visible', { hasText: 'The Cardholder Balance must not exceed $100,000.00' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Save' }).first()).toBeVisible();
  });

});

// ── TC-043: Balance over remaining balance (negative) ───────────────────────────
test.describe('TC-043 | Cardholder balance exceeds remaining balance', () => {
  test.setTimeout(30_000);
  // Wide viewport so the "Remaining Balance" metric renders in full (not truncated)
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('TC-043 | Shows error when Cardholder Balance exceeds the account remaining balance', async ({ page }) => {
    await openFirstCardholderEdit(page);
    await page.waitForTimeout(1_000); // let the balances metric settle/render fully
    const remaining = await getRemainingBalance(page);

    const balanceInput = page.locator(balanceSelector);
    const current = parseFloat((await balanceInput.inputValue()).replace(/[$,]/g, '')) || 0;

    // A value that draws more than the remaining balance (current + remaining + buffer),
    // while staying under the $100,000 hard cap so we isolate the remaining-balance error.
    const overBalance = String(Math.min(99999, Math.ceil(current + remaining) + 1000));

    await balanceInput.click();
    await balanceInput.fill('');
    await balanceInput.pressSequentially(overBalance);
    await balanceInput.blur();

    // ── Save → validation error, form stays open ─────────────────────────────────
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.locator('[role="alert"]:visible', { hasText: 'The Cardholder Balance must not exceed the remaining balance' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Save' }).first()).toBeVisible();
  });

});
