import { test, expect, relaxNavigation, type Page } from '../../src/fixtures/test';
import { randInt } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-073  Cardholder Fund Requests — request & approve
//
// Two-role flow in a single test: the Cardholder submits a "Request
// Additional Funds" request from their dashboard, then the Yacht Admin
// reviews and approves it from the Cardholders page. Each role gets its own
// browser context (opened manually from `browser`, not the `page` fixture)
// so both storageStates are live at once.
//
// Auth: .auth/cardholder.json + .auth/yacht-admin.json (both required —
// playwright.config.ts adds 'setup:cardholder' as an extra dependency on the
// 'yacht-admin' project so both files exist before this spec runs).
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the "Current Balance" column for this cardholder's row in the open
 *  "Review Requests" drawer — avoids reading balance from the cardholder's
 *  own dashboard, which is fine as a source of truth for this test.
 */
async function getCurrentBalanceFromRequestRow(page: Page, cardholderName: string): Promise<number> {
  const escaped = cardholderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = await page.locator('body').innerText();
  const match = text.match(new RegExp(`${escaped}\\s*\\$([\\d,]+\\.\\d{2})`));
  if (!match) throw new Error('Could not read Current Balance from the fund request row');
  return parseFloat(match[1].replace(/,/g, ''));
}

async function getAccountBalances(page: Page): Promise<{ allocated: number; remaining: number }> {
  const text = await page.locator('body').innerText();
  const allocMatch = text.match(/Allocated Balance:\s*\$([\d,]+\.\d{2})/);
  const remMatch = text.match(/Remaining Balance:\s*(-?)\$([\d,]+\.\d{2})/);
  if (!allocMatch || !remMatch) throw new Error('Could not read Account Balances');
  return {
    allocated: parseFloat(allocMatch[1].replace(/,/g, '')),
    remaining: parseFloat(remMatch[2].replace(/,/g, '')) * (remMatch[1] === '-' ? -1 : 1),
  };
}

async function getFundRequestsCount(page: Page): Promise<number> {
  const text = await page.getByRole('heading', { name: /Cardholder Fund Requests/ }).textContent();
  const match = text?.match(/\d+/);
  if (!match) throw new Error('Could not read Cardholder Fund Requests count');
  return parseInt(match[0], 10);
}

/** Poll a numeric read until it stops throwing (widget rendered), then return it. */
async function pollNumber(read: () => Promise<number>, what: string): Promise<number> {
  await expect
    .poll(async () => {
      try {
        return await read();
      } catch {
        return NaN;
      }
    }, { timeout: 15_000, message: `${what} should render` })
    .not.toBeNaN();
  return read();
}

// ── TC-073: Request & Approve ─────────────────────────────────────────────────
test.describe('TC-073 | Cardholder Fund Requests — request and approve', () => {
  test.setTimeout(120_000);

  test('TC-073 | Cardholder requests funds, Yacht Admin approves, balances & counters update', async ({ browser }) => {
    // ═══ Step 1 — Cardholder submits the request ═══════════════════════════
    const cardholderContext = await browser.newContext({ storageState: '.auth/cardholder.json' });
    let cardholderName!: string;
    let amount!: number;
    try {
      const chPage = relaxNavigation(await cardholderContext.newPage());

      await chPage.goto('/dashboard');
      const requestButton = chPage.getByRole('button', { name: 'Request Additional Funds' });
      await expect(requestButton).toBeVisible();

      // Display name shown top-right — used to match the success message later.
      cardholderName = ((await chPage.locator('p[class*="companyName"]').first().textContent()) ?? '').trim();
      if (!cardholderName) throw new Error('Could not read cardholder display name');

      // Whole-dollar amount — the formatted Amount input drops the decimal point
      // when typed (same masking quirk noted elsewhere in this suite), so we
      // stay within 1.00–1000.00 using integer dollars to sidestep it entirely.
      amount = randInt(1, 1000);

      await requestButton.click();
      await expect(chPage.getByRole('heading', { name: 'Request Additional Funds' })).toBeVisible();

      const amountInput = chPage.getByLabel('Amount');
      await amountInput.click();
      await amountInput.pressSequentially(String(amount));
      await amountInput.blur();
      await chPage.getByRole('button', { name: 'Request', exact: true }).click();

      await expect(chPage.getByText('SUCCESS').first()).toBeVisible({ timeout: 20_000 });
      await expect(chPage.getByText('Your additional funds request has been submitted.')).toBeVisible();
      await expect(chPage.getByRole('button', { name: 'Additional Funds Requested' })).toBeDisabled({ timeout: 10_000 });
    } finally {
      await cardholderContext.close();
    }

    // ═══ Step 2 — Yacht Admin reviews and approves ═════════════════════════
    const adminContext = await browser.newContext({ storageState: '.auth/yacht-admin.json' });
    try {
      const admPage = relaxNavigation(await adminContext.newPage());

      await admPage.goto('/cardholders');
      await expect(admPage.getByRole('heading', { name: 'Cardholders' })).toBeVisible();

      // Poll: the balances metric renders asynchronously after the heading.
      const allocBefore = await pollNumber(async () => (await getAccountBalances(admPage)).allocated, 'Account Balances');
      const remBefore = (await getAccountBalances(admPage)).remaining;
      const requestsBefore = await getFundRequestsCount(admPage);
      expect(requestsBefore).toBeGreaterThan(0);

      await admPage.getByRole('button', { name: 'Review Requests' }).click();
      await expect(admPage.getByRole('heading', { name: /Cardholder Additional Fund Requests/ })).toBeVisible();

      // Poll: the request rows render asynchronously inside the drawer.
      const balanceBefore = await pollNumber(
        () => getCurrentBalanceFromRequestRow(admPage, cardholderName),
        'Fund request row'
      );
      await admPage.getByRole('button', { name: 'Approve' }).click();

      await expect(admPage.getByRole('heading', { name: 'Approve', exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(admPage.getByText("Are you sure you want to approve this cardholder's request?")).toBeVisible();
      await admPage.getByRole('button', { name: 'Yes' }).click();

      // ── Success ────────────────────────────────────────────────────────────
      const expectedBalance = balanceBefore + amount;
      const expectedBalanceFormatted = expectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      await expect(admPage.getByText('SUCCESS!')).toBeVisible({ timeout: 20_000 });
      // KNOWN BUG: this toast hardcodes the £ symbol regardless of the account's
      // actual currency — every other balance on this page renders in $ for this
      // account. Asserting the real (buggy) text so the test reflects current
      // behavior; update if/when the currency symbol is fixed to match the account.
      await expect(admPage.getByText(`${cardholderName}'s cardholder balance is now £${expectedBalanceFormatted}.`)).toBeVisible();

      // ── Balances & counter updated correctly (poll — they settle async) ────
      await expect
        .poll(async () => (await getAccountBalances(admPage)).allocated, { timeout: 15_000 })
        .toBeCloseTo(allocBefore + amount, 2);
      expect((await getAccountBalances(admPage)).remaining).toBeCloseTo(remBefore - amount, 2);

      const requestsAfter = await getFundRequestsCount(admPage);
      expect(requestsAfter).toBe(requestsBefore - 1);

      // ── Cardholder's own balance increased in the Cardholders list ─────────
      await admPage.getByPlaceholder('Search').fill(cardholderName);
      await expect(admPage.getByText(`$${expectedBalanceFormatted}`, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await adminContext.close();
    }
  });

});
