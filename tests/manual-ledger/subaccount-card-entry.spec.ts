import { test, expect, type Page } from '@playwright/test';
import {
  getDepartmentBalance,
  getFirstDepartmentName,
  getCurrencySymbol,
  selectCharterOrAsset,
} from '../../src/helpers/manual-ledger.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash entry via a sub-account's own Department card
//
// Unlike the other Cash Account Balances specs (which start from the
// "Add Cash Entry" button → "Transaction or Transfer" → Transfer), this
// entry point is the sub-account's own clickable Department balance card
// (e.g. "1. Pilot" — labelled "Open manual entry for <name>"). Clicking it
// jumps straight to "Debit or Credit", skipping "Transaction or Transfer"
// entirely — a card click is always a cash transfer scoped to that specific
// sub-account.
//
// ASSUMPTION (best-effort, unconfirmed): since the sub-account is already
// fixed by which card was clicked, the "Debit Details"/"Credit Details"
// account-picker screen is skipped too, going straight to Debit/Credit
// Amount. If that's wrong, the test will fail there and needs a fix once
// the actual screen is seen.
//
// Four variants (Credit / Debit × Boat-or-Operational / Charter), defined
// in this order deliberately: Credit tests run first so the sub-account has
// funds in it by the time the Debit tests run against the same account
// (this suite hit a real "insufficient funds" case when Debit ran first
// against a fresh £0.00 department).
//   - "Sub-account Cash Credit (Boat)"
//   - "Sub-account Cash Credit (Charter)"
//   - "Sub-account Cash Debit (Boat)"
//   - "Sub-account Cash Debit (Charter)"
//
// Shared flow:
//  1. /accounts → click the first Department card ("Open manual entry for <name>")
//  2. "Debit or Credit" screen → Debit / Credit
//  3. "Charter or Boat/Operational" screen → Boat-or-Operational / Charter
//     (+ pick first charter from the list, for the Charter variant)
//  4. Debit/Credit Amount → Next
//  5. Select today's Transaction Date (Day / Month / Year) → Next
//  6. [Debit only] Categorize Debit — first Category, first Subcategory → Next
//  7. [Debit only] Add a Note → Next
//  8. Debit/Credit Summary — verify entered data
//  9. Submit
// 10. [Debit only] Success confirmation appears
//     (Credit success-confirmation wording is unconfirmed — TODO, matches
//     the same gap in cash-credit-entry.spec.ts)
// 11. The sub-account's own Department balance changed by the entered amount
// 12. Verify the new transaction row + expand details (+ Charter, for the
//     Charter variants)
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

const STEP_DELAY = 500;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Open a dropdown by its associated label, pick the first option, and return its text. */
async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').first();
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

test('Sub-account Cash Credit (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const CREDIT_AMOUNT = '2600';

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

  // Step 1: Read the first Department card's name + balance BEFORE clicking it.
  const subAccountName = await getFirstDepartmentName(page);
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);
  await page.getByRole('button', { name: `Open manual entry for ${subAccountName}` }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Debit or Credit — "Credit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Credit Amount — the dialog itself carries the "Credit amount"
  // aria-label, so getByLabel resolves to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Credit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const creditAmountDialog = page.getByRole('dialog', { name: 'Credit Amount' });
  await creditAmountDialog.locator('input').fill(CREDIT_AMOUNT);
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

  // Step 6: Credit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // TODO: success confirmation check — need to confirm its exact wording for this flow

  // Step 8: The sub-account's own Department balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Verify the new transaction appears in Manual Transactions
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

test('Sub-account Cash Credit (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Distinct from the Boat variant's amount so the two tests' transactions
  // never collide when filtering the list by text (both hit the same first
  // sub-account).
  const CREDIT_AMOUNT = '2700';

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

  // Step 1: Read the first Department card's name + balance BEFORE clicking it.
  const subAccountName = await getFirstDepartmentName(page);
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);
  await page.getByRole('button', { name: `Open manual entry for ${subAccountName}` }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Debit or Credit — "Credit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane); "Charter" itself also appears in the dialog
  // heading, so selectCharterOrAsset() scopes to buttons and clicks it.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'charter');
  await page.waitForTimeout(STEP_DELAY);

  // Step 3b: Choose the Charter — pick the first from "Active Charters*"
  await expect(page.getByRole('heading', { name: 'Choose the Charter' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const charterName = await selectFirstOption(page, 'Active Charters*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Credit Amount — the dialog itself carries the "Credit amount"
  // aria-label, so getByLabel resolves to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Credit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const creditAmountDialog = page.getByRole('dialog', { name: 'Credit Amount' });
  await creditAmountDialog.locator('input').fill(CREDIT_AMOUNT);
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

  // Step 6: Credit Summary — verify entered data.
  // The Charter isn't shown on this screen (matches the same finding on the
  // other Charter flows in this suite), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // TODO: success confirmation check — need to confirm its exact wording for this flow

  // Step 8: The sub-account's own Department balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Verify the new transaction appears in Manual Transactions
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

test('Sub-account Cash Debit (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const DEBIT_AMOUNT = '2200';
  const NOTE_TEXT = 'Auto Test Sub-account Card Debit';

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

  // Step 1: Read the first Department card's name + balance BEFORE clicking
  // it (the underlying page is still in the DOM once the drawer opens too,
  // but reading it now avoids any ambiguity).
  const subAccountName = await getFirstDepartmentName(page);
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);
  await page.getByRole('button', { name: `Open manual entry for ${subAccountName}` }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Debit or Credit — "Debit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Debit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Debit Amount — the dialog itself carries the "Debit amount"
  // aria-label, so getByLabel would resolve to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Debit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitAmountDialog = page.getByRole('dialog', { name: 'Debit Amount' });
  await debitAmountDialog.locator('input').fill(DEBIT_AMOUNT);
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

  // Step 6: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Add a Note
  await expect(page.getByRole('heading', { name: 'Add a Note' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Debit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Debit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Debit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: The sub-account's own Department balance decreased by the debited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Verify the new transaction appears in Manual Transactions
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
  // Debit is shown as "-<symbol>2,200.00" in the row
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText(category);
  await expect(cells.nth(4)).toHaveText(subcategory);
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  await page.waitForTimeout(STEP_DELAY);

  // Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter is optional — only check the label is present, not its value
  await expect(transactionArticle.getByText('Charter:')).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Cash Debit Transfer', { exact: true })).toBeVisible();
});

test('Sub-account Cash Debit (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Distinct from the Boat variant's values so the two tests' transactions
  // never collide when filtering the list by text (both hit the same
  // first sub-account).
  const DEBIT_AMOUNT = '2300';
  const NOTE_TEXT = 'Auto Test Sub-account Card Debit Charter';

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

  // Step 1: Read the first Department card's name + balance BEFORE clicking it.
  const subAccountName = await getFirstDepartmentName(page);
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);
  await page.getByRole('button', { name: `Open manual entry for ${subAccountName}` }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Debit or Credit — "Debit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Debit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane); "Charter" itself also appears in the dialog
  // heading, so selectCharterOrAsset() scopes to buttons and clicks it.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'charter');
  await page.waitForTimeout(STEP_DELAY);

  // Step 3b: Choose the Charter — pick the first from "Active Charters*"
  await expect(page.getByRole('heading', { name: 'Choose the Charter' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const charterName = await selectFirstOption(page, 'Active Charters*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Debit Amount — the dialog itself carries the "Debit amount"
  // aria-label, so getByLabel would resolve to the <aside>, not the input.
  // Scope to the dialog and target its input directly.
  await expect(page.getByRole('heading', { name: 'Debit Amount' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const debitAmountDialog = page.getByRole('dialog', { name: 'Debit Amount' });
  await debitAmountDialog.locator('input').fill(DEBIT_AMOUNT);
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

  // Step 6: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Add a Note
  await expect(page.getByRole('heading', { name: 'Add a Note' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Debit Summary — verify entered data.
  // The Charter isn't shown on this screen (matches the same finding on the
  // other Charter flows in this suite), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Debit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Debit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: The sub-account's own Department balance decreased by the debited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Verify the new transaction appears in Manual Transactions
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
  // Debit is shown as "-<symbol>2,300.00" in the row
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(cells.nth(3)).toHaveText(category);
  await expect(cells.nth(4)).toHaveText(subcategory);
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  // Charter — now set (unlike the Boat variant's unset "Select" placeholder)
  await expect(cells.last()).toHaveText(charterName);
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
  await expect(transactionArticle.getByText('Cash Debit Transfer', { exact: true })).toBeVisible();
});
