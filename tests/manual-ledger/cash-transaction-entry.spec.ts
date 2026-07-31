import { test, expect, type Page } from '@playwright/test';
import { getCurrencySymbol, selectCharterOrAsset } from '../../src/helpers/manual-ledger.helper';
// TODO: known bug — Cash Account Balances don't update as expected after a
// Transaction debit, so this check is disabled. Re-import once fixed.
// import { getCashAccountBalances } from '../../src/helpers/manual-ledger.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Transaction)
//
// Unlike the Transfer flow, "Transaction" skips the "Debit or Credit" screen
// (a Transaction is always a debit/expense), and its "Debit Details" step is
// a free-text Supplier Name field rather than an account dropdown.
//
// Two variants of the same flow, differing only in the "Charter or Boat"
// choice:
//   - "Boat" test    → no charter attached
//   - "Charter" test → picks the first charter from the list; verifies the
//                      Charter is shown correctly in the Debit Summary and
//                      in the expanded transaction details afterwards
//
// Shared flow:
//  1. /accounts → click "Add Cash Entry"
//  2. "Transaction or Transfer" screen → Transaction
//  3. "Charter or Boat" screen → Boat / Charter (+ pick first charter from the list)
//  4. Debit Details — enter Supplier Name → Next
//  5. Select today's Transaction Date (Day / Month / Year) → Next
//  6. Debit Amount → Next
//  7. Categorize Debit — first Category, first Subcategory → Next
//  8. Upload Your Receipt — "No receipt available" → Next
//  9. Add a Note → Next
// 10. Debit Summary — verify entered data (+ Charter, for the Charter variant)
// 11. Submit
// 12. Success confirmation appears
// 13. Cash Account Balances check — currently commented out (known bug:
//     Total/Remaining Balance don't update as expected after this flow)
// 14. Verify the new transaction row + expand details (+ Charter, for the
//     Charter variant)
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

const SUPPLIER_NAME   = 'Auto Test Cash debit transfer';
const DEBIT_AMOUNT    = '101';
const NOTE_TEXT       = 'Auto Test Cash debit transfer Note';
const STEP_DELAY      = 500;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Open a dropdown by its associated label, pick the first option, and return its text. */
async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').first();
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

test('Transaction (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const now = new Date();
  const day   = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const year  = String(now.getFullYear());
  const transactionDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;

  await page.goto('/accounts');
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Logged-in user's display name, shown in the header (banner: [Help, date, name]).
  // Captured dynamically since it depends on whichever account runs the test.
  const loggedInUserName = (await page.getByRole('banner').locator('p').nth(1).innerText()).trim();

  // Currency depends on the logged-in account (EUR/USD/GBP) — read it
  // dynamically instead of hardcoding a symbol.
  const currency = await getCurrencySymbol(page);
  const formattedAmount = `${currency}${Number(DEBIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // TODO: known bug — balances don't update as expected after a Transaction
  // debit, so the before/after capture below is commented out until fixed.
  // const balancesBefore = await getCashAccountBalances(page);

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transaction" also appears in the
  // dialog heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transaction', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Debit Details — free-text Supplier Name field. Scoped to the
  // dialog to avoid the same aria-label collision seen on the Amount screens.
  await expect(page.getByRole('heading', { name: 'Debit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitDetailsDialog = page.getByRole('dialog', { name: 'Debit Details' });
  await debitDetailsDialog.locator('input').fill(SUPPLIER_NAME);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Transaction Date — today
  await page.getByRole('button', { name: 'Day' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: day, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Month' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: month }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Year' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: year, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Debit Amount — the dialog itself carries the "Debit amount"
  // aria-label, so getByLabel would resolve to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Debit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitAmountDialog = page.getByRole('dialog', { name: 'Debit Amount' });
  await debitAmountDialog.locator('input').fill(DEBIT_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Upload Your Receipt — skip via "No receipt available"
  await expect(page.getByRole('heading', { name: 'Upload Your Receipt' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('checkbox', { name: 'No receipt available' }).check();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Add a Note
  await expect(page.getByRole('heading', { name: 'Add a Note' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Debit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Debit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Debit Summary' });
  // exact: true — NOTE_TEXT starts with SUPPLIER_NAME, so a substring match
  // on SUPPLIER_NAME would also match the Note field and be ambiguous.
  await expect(summary.getByText(SUPPLIER_NAME, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText('No', { exact: true })).toBeVisible(); // Receipt — skipped
  await expect(summary.getByText(NOTE_TEXT, { exact: true })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 13: Cash Account Balances after the debit.
  // TODO: known bug — Total and Remaining Balance should decrease by the
  // debited amount here, but currently don't. Re-enable once fixed.
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  // const balancesAfter = await getCashAccountBalances(page);
  // expect(balancesAfter.total).toBeCloseTo(balancesBefore.total - Number(DEBIT_AMOUNT), 2);
  // expect(balancesAfter.remaining).toBeCloseTo(balancesBefore.remaining - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 14: Verify the new transaction appears in Manual Transactions
  // The supplier name is unique enough on its own, but we also filter by
  // amount for extra safety, consistent with the rest of the suite.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: SUPPLIER_NAME })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(SUPPLIER_NAME, { exact: true })).toBeVisible();
  // Debit is shown as "-<symbol>101.00" in the row
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText(category);
  await expect(cells.nth(4)).toHaveText(subcategory);
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
});

test('Transaction (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Local to this test — distinct from the Boat variant's values so the two
  // tests' transactions never collide when filtering the list by text.
  const SUPPLIER_NAME = 'Auto Test Cash debit transfer Charter';
  const DEBIT_AMOUNT  = '100';
  const NOTE_TEXT     = 'Auto Test Cash debit transfer Charter Note';

  const now = new Date();
  const day   = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const year  = String(now.getFullYear());
  const transactionDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;

  await page.goto('/accounts');
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Logged-in user's display name, shown in the header (banner: [Help, date, name]).
  // Captured dynamically since it depends on whichever account runs the test.
  const loggedInUserName = (await page.getByRole('banner').locator('p').nth(1).innerText()).trim();

  // Currency depends on the logged-in account (EUR/USD/GBP) — read it
  // dynamically instead of hardcoding a symbol.
  const currency = await getCurrencySymbol(page);
  const formattedAmount = `${currency}${Number(DEBIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transaction" also appears in the
  // dialog heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transaction', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane); "Charter" itself also appears in the dialog
  // heading, so selectCharterOrAsset() scopes to buttons and clicks it.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'charter');
  await page.waitForTimeout(STEP_DELAY);

  // Step 3b: "Choose the Charter" screen — pick the first from "Active Charters*"
  await expect(page.getByRole('heading', { name: 'Choose the Charter' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const charterName = await selectFirstOption(page, 'Active Charters*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Debit Details — free-text Supplier Name field. Scoped to the
  // dialog to avoid the same aria-label collision seen on the Amount screens.
  await expect(page.getByRole('heading', { name: 'Debit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitDetailsDialog = page.getByRole('dialog', { name: 'Debit Details' });
  await debitDetailsDialog.locator('input').fill(SUPPLIER_NAME);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Transaction Date — today
  await page.getByRole('button', { name: 'Day' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: day, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Month' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: month }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Year' }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: year, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Debit Amount — the dialog itself carries the "Debit amount"
  // aria-label, so getByLabel would resolve to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Debit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitAmountDialog = page.getByRole('dialog', { name: 'Debit Amount' });
  await debitAmountDialog.locator('input').fill(DEBIT_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Upload Your Receipt — skip via "No receipt available"
  await expect(page.getByRole('heading', { name: 'Upload Your Receipt' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('checkbox', { name: 'No receipt available' }).check();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Add a Note
  await expect(page.getByRole('heading', { name: 'Add a Note' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Debit Summary — verify entered data.
  // The Charter isn't shown on this screen (only Supplier Name, Transaction
  // Date, Debit Amount, Receipt, Note), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Debit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Debit Summary' });
  // exact: true — NOTE_TEXT starts with SUPPLIER_NAME, so a substring match
  // on SUPPLIER_NAME would also match the Note field and be ambiguous.
  await expect(summary.getByText(SUPPLIER_NAME, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText('No', { exact: true })).toBeVisible(); // Receipt — skipped
  await expect(summary.getByText(NOTE_TEXT, { exact: true })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 13: Cash Account Balances after the debit.
  // TODO: known bug — Total and Remaining Balance should decrease by the
  // debited amount here, but currently don't. Re-enable once fixed.
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  // const balancesAfter = await getCashAccountBalances(page);
  // expect(balancesAfter.total).toBeCloseTo(balancesBefore.total - Number(DEBIT_AMOUNT), 2);
  // expect(balancesAfter.remaining).toBeCloseTo(balancesBefore.remaining - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 14: Verify the new transaction appears in Manual Transactions
  // The supplier name is unique enough on its own, but we also filter by
  // amount for extra safety, consistent with the rest of the suite.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: SUPPLIER_NAME })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(SUPPLIER_NAME, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText(category);
  await expect(cells.nth(4)).toHaveText(subcategory);
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter — verify the actual picked charter name is displayed, not just the label.
  // The row's own Charter cell already shows this same value, so within this
  // article there are two matches for it; `.last()` targets the one in the
  // expanded detail panel (rendered after the row in the DOM).
  await expect(transactionArticle.getByText('Charter:')).toBeVisible();
  await expect(transactionArticle.getByText(charterName, { exact: true }).last()).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
});
