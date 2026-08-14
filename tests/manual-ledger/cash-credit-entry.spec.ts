import { test, expect, type Page } from '@playwright/test';
import { getCashAccountBalances, getDepartmentBalance, waitForDepartmentBalanceChange, getCurrencySymbol, selectCharterOrAsset } from '../../src/helpers/manual-ledger.helper';
import { authState } from '../../src/fixtures/users';

// Explicit role for this file — independent of which project's testMatch
// glob happens to pick it up. Only affects which storageState this file's
// tests load; the matching setup:yacht-admin project still needs to run
// first so .auth/yacht-admin.json actually exists.
test.use({ storageState: authState('yacht-admin') });

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Credit / Transfer)
//
// Three variants of the same flow:
//   - "Boat" test        → Main Cash Account (checks Total/Remaining Balance)
//   - "Sub-account" test → first sub-account after Main Cash Account
//                          (checks that sub-account's own Department balance)
//   - "Charter" test     → picks "Charter" instead of "Boat" and the first
//                          charter from the list; verifies the Charter is
//                          shown correctly in the transaction row + expanded
//                          details afterwards
//
// Shared flow:
//  1. /accounts → click "Add Cash Entry"
//  2. "Transaction or Transfer" screen → Transfer
//  3. "Debit or Credit" screen → Credit
//  4. "Charter or Boat" screen → Boat
//  5. Credit Details — select receiving Account → Next
//  6. Credit Amount → Next
//  7. Select today's Transaction Date (Day / Month / Year) → Next
//  8. Credit Summary — verify Account, Credit Amount, Transaction Date
//  9. Submit
// 10. Relevant balance(s) increased by the credited amount
// 11. Verify the new transaction row + expand details (Charter Name optional)
//     (success confirmation check is TODO — need to confirm its exact wording)
// ─────────────────────────────────────────────────────────────────────────────

const CASH_ACCOUNT    = 'Main Cash Account';
const CREDIT_AMOUNT   = '2000';
const STEP_DELAY      = 500;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Open the Account dropdown in "Credit Details", pick the option at `index`, and return its text. */
async function selectAccountOption(page: Page, index: number): Promise<string> {
  await page.getByLabel('Account*', { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').nth(index);
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

/** Open a dropdown by its associated label, pick the first option, and return its text. */
async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').first();
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

test('Credit to Main Cash Account (Boat)', async ({ page }) => {
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
  const formattedAmount = `${currency}${Number(CREDIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const balancesBefore = await getCashAccountBalances(page);

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transfer" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Debit or Credit — "Credit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Credit Details — select the receiving Account (Main Cash Account)
  await expect(page.getByRole('heading', { name: 'Credit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByLabel('Account*', { exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: CASH_ACCOUNT, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Credit Amount — the dialog itself carries the "Credit amount"
  // aria-label, so getByLabel resolves to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Credit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const creditAmountDialog = page.getByRole('dialog', { name: 'Credit Amount' });
  await creditAmountDialog.locator('input').fill(CREDIT_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Transaction Date — today
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

  // Step 8: Credit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(CASH_ACCOUNT, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Total Balance and Remaining Balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balancesAfter = await getCashAccountBalances(page);
  expect(balancesAfter.total).toBeCloseTo(balancesBefore.total + Number(CREDIT_AMOUNT), 2);
  expect(balancesAfter.remaining).toBeCloseTo(balancesBefore.remaining + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // TODO: success confirmation check — need to confirm its exact wording for this flow

  // Step 11: Verify the new transaction appears in Manual Transactions
  // "Main Cash Account" is a generic name reused by many prior staging
  // transactions, so also filter by amount to land on the one we just made.
  // Scoped to the enclosing article so both the row and its expanded details
  // can be checked through the same locator.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: CASH_ACCOUNT })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(CASH_ACCOUNT, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText('N/A'); // Category — not applicable to cash entries
  await expect(cells.nth(4)).toHaveText('N/A'); // Subcategory — not applicable to cash entries
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  await expect(cells.last()).toHaveText('Select'); // Charter — unset placeholder
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter Name is optional — only check the label is present, not its value
  await expect(transactionArticle.getByText('Charter Name:')).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Cash Credit Transfer', { exact: true })).toBeVisible();
});

test('Credit to a sub-account', async ({ page }) => {
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
  const formattedAmount = `${currency}${Number(CREDIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transfer" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Debit or Credit — "Credit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Credit Details — select the first sub-account after Main Cash Account
  await expect(page.getByRole('heading', { name: 'Credit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const subAccountName = await selectAccountOption(page, 1); // index 0 = Main Cash Account
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Read the sub-account's Department balance now, before the credit is
  // submitted — the underlying page (behind this drawer) is still in the DOM.
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);

  // Step 6: Credit Amount — the dialog itself carries the "Credit amount"
  // aria-label, so getByLabel resolves to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Credit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const creditAmountDialog = page.getByRole('dialog', { name: 'Credit Amount' });
  await creditAmountDialog.locator('input').fill(CREDIT_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Transaction Date — today
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

  // Step 8: Credit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: The sub-account's own Department balance increased by the credited amount
  // The card doesn't show a loading skeleton on reload — it keeps the old,
  // validly-formatted amount until the refetch lands — so wait for it to
  // actually move off the pre-credit value instead of reading right away.
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await waitForDepartmentBalanceChange(page, subAccountName, departmentBalanceBefore);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // TODO: success confirmation check — need to confirm its exact wording for this flow

  // Step 11: Verify the new transaction appears in Manual Transactions
  // The sub-account name is generic and reused by prior staging transactions,
  // so also filter by amount to land on the one we just made. Scoped to the
  // enclosing article so both the row and its expanded details can be
  // checked through the same locator.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: subAccountName })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText('N/A'); // Category — not applicable to cash entries
  await expect(cells.nth(4)).toHaveText('N/A'); // Subcategory — not applicable to cash entries
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  await expect(cells.last()).toHaveText('Select'); // Charter — unset placeholder
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter Name is optional — only check the label is present, not its value
  await expect(transactionArticle.getByText('Charter Name:')).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Cash Credit Transfer', { exact: true })).toBeVisible();
});

test('Credit to Main Cash Account (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Local to this test — distinct from the Boat variant's amount so the two
  // tests' transactions never collide when filtering the list by text
  // (both use the same CASH_ACCOUNT name in their filter).
  const CREDIT_AMOUNT = '2500';

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
  const formattedAmount = `${currency}${Number(CREDIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const balancesBefore = await getCashAccountBalances(page);

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transfer" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Debit or Credit — "Credit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane); "Charter" itself also appears in the dialog
  // heading, so selectCharterOrAsset() scopes to buttons and clicks it.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'charter');
  await page.waitForTimeout(STEP_DELAY);

  // Step 4b: Choose the Charter — pick the first from "Active Charters*"
  await expect(page.getByRole('heading', { name: 'Choose the Charter' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const charterName = await selectFirstOption(page, 'Active Charters*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Credit Details — select the receiving Account (Main Cash Account)
  await expect(page.getByRole('heading', { name: 'Credit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByLabel('Account*', { exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('option', { name: CASH_ACCOUNT, exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Credit Amount — the dialog itself carries the "Credit amount"
  // aria-label, so getByLabel resolves to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Credit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const creditAmountDialog = page.getByRole('dialog', { name: 'Credit Amount' });
  await creditAmountDialog.locator('input').fill(CREDIT_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Transaction Date — today
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

  // Step 8: Credit Summary — verify entered data.
  // The Charter isn't shown on this screen (matches the same finding for
  // Debit Summary in the Transaction/Charter flow), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(CASH_ACCOUNT, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Total Balance and Remaining Balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balancesAfter = await getCashAccountBalances(page);
  expect(balancesAfter.total).toBeCloseTo(balancesBefore.total + Number(CREDIT_AMOUNT), 2);
  expect(balancesAfter.remaining).toBeCloseTo(balancesBefore.remaining + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // TODO: success confirmation check — need to confirm its exact wording for this flow

  // Step 11: Verify the new transaction appears in Manual Transactions
  // "Main Cash Account" is a generic name reused by many prior staging
  // transactions, so also filter by amount to land on the one we just made.
  // Scoped to the enclosing article so both the row and its expanded details
  // can be checked through the same locator.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: CASH_ACCOUNT })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(CASH_ACCOUNT, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText('N/A'); // Category — not applicable to cash entries
  await expect(cells.nth(4)).toHaveText('N/A'); // Subcategory — not applicable to cash entries
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  // Charter — now set (unlike the Boat variant's unset "Select" placeholder)
  await expect(cells.last()).toHaveText(charterName);
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter Name — verify the actual picked charter name is displayed, not just the label.
  // The row's own Charter cell already shows this same value, so within this
  // article there are two matches for it; `.last()` targets the one in the
  // expanded detail panel (rendered after the row in the DOM).
  await expect(transactionArticle.getByText('Charter Name:')).toBeVisible();
  await expect(transactionArticle.getByText(charterName, { exact: true }).last()).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Cash Credit Transfer', { exact: true })).toBeVisible();
});
