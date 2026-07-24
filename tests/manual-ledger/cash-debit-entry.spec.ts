import { test, expect, type Page } from '@playwright/test';
import { getDepartmentBalance } from '../../src/helpers/manual-ledger.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Debit / Transfer)
//
// Two variants of the same flow, differing only in the "Charter or Boat"
// choice:
//   - "Boat" test    → no charter attached
//   - "Charter" test → picks the first charter from the list; verifies the
//                      Charter is shown correctly in the transaction row +
//                      expanded details afterwards
//
// Shared flow:
//  1. /accounts → click "Add Cash Entry"
//  2. "Transaction or Transfer" screen → Transfer
//  3. "Debit or Credit" screen → Debit
//  4. "Charter or Boat" screen → Boat / Charter (+ pick first charter from the list)
//  5. Debit Details — select the first sub-account from the list → Next
//  6. Debit Amount → Next
//  7. Select today's Transaction Date (Day / Month / Year) → Next
//  8. Categorize Debit — first Category, first Subcategory → Next
//  9. Add a Note → Next
// 10. Debit Summary — verify entered data
// 11. Submit
//     NOTE: staging may reject this with "...does not have enough funds..."
//     if the picked sub-account (or Main Cash Account) can't cover the debit.
//     No special handling here — if that happens, the test is expected to
//     fail at the success-confirmation step below.
// 12. Success confirmation appears
// 13. The picked sub-account's Department balance decreased by the debited amount
// 14. Verify the new transaction row + expand details (+ Charter, for the
//     Charter variant)
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

const CHARTER_OR_BOAT = 'Boat';
const DEBIT_AMOUNT    = '2000';
const NOTE_TEXT       = 'Auto Test Cash debit transfer';
const STEP_DELAY      = 1_000;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Open a dropdown by its associated label, pick the first option, and return its text. */
async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').first();
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

test('Debit from Subaccount (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const now = new Date();
  const day   = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const year  = String(now.getFullYear());
  const transactionDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
  const formattedAmount = `€${Number(DEBIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  await page.goto('/accounts');
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Logged-in user's display name, shown in the header (banner: [Help, date, name]).
  // Captured dynamically since it depends on whichever account runs the test.
  const loggedInUserName = (await page.getByRole('banner').locator('p').nth(1).innerText()).trim();

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transfer" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Debit or Credit — "Debit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Debit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Charter or Boat — "Boat" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Charter or Boat' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: CHARTER_OR_BOAT, exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Debit Details — select the first sub-account from the list
  await expect(page.getByRole('heading', { name: 'Debit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const subAccountName = await selectFirstOption(page, 'Account*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Read the sub-account's Department balance now, before the debit is
  // submitted — the underlying page (behind this drawer) is still in the DOM.
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);

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

  // Step 8: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
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
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 13: The picked sub-account's Department balance decreased by the debited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 14: Verify the new transaction appears in Manual Transactions
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
  // Debit is shown as "-€1,000.00" in the row
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

test('Debit from Subaccount (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Local to this test — distinct from the Boat variant's amount so the two
  // tests' transactions never collide when filtering the list by text
  // (both may pick the same first sub-account from the list).
  const DEBIT_AMOUNT = '2100';
  const NOTE_TEXT     = 'Auto Test Cash debit transfer Charter';

  const now = new Date();
  const day   = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const year  = String(now.getFullYear());
  const transactionDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
  const formattedAmount = `€${Number(DEBIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  await page.goto('/accounts');
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Logged-in user's display name, shown in the header (banner: [Help, date, name]).
  // Captured dynamically since it depends on whichever account runs the test.
  const loggedInUserName = (await page.getByRole('banner').locator('p').nth(1).innerText()).trim();

  // Step 1: Open Add Cash Entry
  await page.getByRole('button', { name: 'Add Cash Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Transaction or Transfer — "Transfer" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Transaction or Transfer' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Debit or Credit — "Debit" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Debit or Credit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Debit', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Charter or Boat — "Charter" also appears in the dialog heading,
  // so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Charter or Boat' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Charter', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 4b: Choose the Charter — pick the first from "Active Charters*"
  await expect(page.getByRole('heading', { name: 'Choose the Charter' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const charterName = await selectFirstOption(page, 'Active Charters*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Debit Details — select the first sub-account from the list
  await expect(page.getByRole('heading', { name: 'Debit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const subAccountName = await selectFirstOption(page, 'Account*');
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Read the sub-account's Department balance now, before the debit is
  // submitted — the underlying page (behind this drawer) is still in the DOM.
  const departmentBalanceBefore = await getDepartmentBalance(page, subAccountName);

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

  // Step 8: Categorize Debit — first Category, first Subcategory
  await expect(page.getByRole('heading', { name: 'Categorize Debit' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
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
  // The Charter isn't shown on this screen (matches the same finding for
  // the Transaction/Charter flow), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Debit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Debit Summary' });
  await expect(summary.getByText(subAccountName, { exact: true })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 13: The picked sub-account's Department balance decreased by the debited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const departmentBalanceAfter = await getDepartmentBalance(page, subAccountName);
  expect(departmentBalanceAfter).toBeCloseTo(departmentBalanceBefore - Number(DEBIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 14: Verify the new transaction appears in Manual Transactions
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
  // Debit is shown as "-€2,100.00" in the row
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
