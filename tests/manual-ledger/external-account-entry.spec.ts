import { test, expect, type Page } from '@playwright/test';
import { getExternalAccountBalance, getCurrencySymbol, selectCharterOrAsset } from '../../src/helpers/manual-ledger.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — External Account — Add Manual Entry (Credit / Paid Invoice)
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

const STEP_DELAY    = 500;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Open a dropdown by its associated label, pick the first option, and return its text. */
async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').first();
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit
//
// Flow:
//  1. /accounts → click "Add Manual Entry"
//  2. "Credit or Paid Invoice" screen → Credit
//  3. "Charter or Boat" screen → Boat
//  4. Enter Credit Amount → Next
//  5. Enter Creditor Name → Next
//  6. Select today's Transaction Date (Day / Month / Year) → Next
//  7. Credit Summary — verify Credit Amount, Credit Details, Transaction Date
//  8. Submit
//  9. Success confirmation appears
// 10. External Account balance increased by the credited amount
// 11. Verify the new transaction row + expand details
// ─────────────────────────────────────────────────────────────────────────────

test('Credit (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const CREDIT_AMOUNT = '1000';
  const CREDITOR_NAME = 'Auto test';

  const now = new Date();
  const day   = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const year  = String(now.getFullYear());

  await page.goto('/accounts');
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Currency depends on the logged-in account (EUR/USD/GBP) — read it
  // dynamically instead of hardcoding a symbol.
  const currency = await getCurrencySymbol(page);
  const formattedAmount = `${currency}${Number(CREDIT_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const balanceBefore = await getExternalAccountBalance(page);

  // Step 1: Open Add Manual Entry
  await page.getByRole('button', { name: 'Add Manual Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Credit or Paid Invoice — "Credit" also appears in the dialog
  // heading, so scope to buttons and take the first match (same pattern
  // used elsewhere in the suite for duplicate button text).
  await expect(page.getByRole('heading', { name: 'Credit or Paid Invoice' })).toBeVisible({ timeout: 10_000 });
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

  // Step 5: Credit Details — "Creditor Name" is only the input's
  // placeholder, not an associated label, so getByLabel can't find it.
  await expect(page.getByRole('heading', { name: 'Credit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Creditor Name').fill(CREDITOR_NAME);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Transaction Date — today
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

  // Step 7: Credit Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  // Credit Amount is shown as "<symbol>1,000.00" (currency depends on the account)
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);
  await expect(summary.getByText(CREDITOR_NAME, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);
  // Transaction Date is shown as "MM-DD-YYYY"
  await expect(summary.getByText(`${String(now.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}-${year}`, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByText('Your bank account has been credited', { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: External Account balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balanceAfter = await getExternalAccountBalance(page);
  expect(balanceAfter).toBeCloseTo(balanceBefore + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Verify the new transaction appears in Manual Transactions
  // Prior runs leave their own "Auto test" rows in staging — take the first match.
  const transactionRow = page.getByRole('row', { name: new RegExp(CREDITOR_NAME) }).first();
  await expect(transactionRow).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionRow.getByText(CREDITOR_NAME, { exact: true })).toBeVisible();
  await expect(transactionRow.getByText(formattedAmount, { exact: true })).toBeVisible();
  await expect(transactionRow.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(transactionRow.getByText('—', { exact: true })).toBeVisible(); // Subcategory — unset
  await expect(transactionRow.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Expand transaction details
  await transactionRow.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // TODO: verify fields inside the expanded details panel — need to see its
  // structure first.
});

// ─────────────────────────────────────────────────────────────────────────────
// Credit (Charter)
//
// Same as "Credit" above, except "Charter or Boat" → Charter, with the
// first charter from the list picked and verified in the transaction row +
// expanded details afterwards.
//
// Flow:
//  1. /accounts → click "Add Manual Entry"
//  2. "Credit or Paid Invoice" screen → Credit
//  3. "Charter or Boat" screen → Charter
//  3b. "Choose the Charter" screen → pick first from Active Charters*
//  4. Enter Credit Amount → Next
//  5. Enter Creditor Name → Next
//  6. Select today's Transaction Date (Day / Month / Year) → Next
//  7. Credit Summary — verify Credit Amount, Creditor Name, Transaction Date
//     (Charter isn't shown on this screen, per the same finding on the
//     other Charter flows in this suite)
//  8. Submit
//  9. Success confirmation appears
// 10. External Account balance increased by the credited amount
// 11. Verify the new transaction row + expand details (+ Charter)
// ─────────────────────────────────────────────────────────────────────────────

test('Credit (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  // Distinct from the Boat variant's values so the two tests' transactions
  // never collide when filtering the list by text.
  const CREDIT_AMOUNT = '1200';
  const CREDITOR_NAME = 'Auto test Charter';

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

  const balanceBefore = await getExternalAccountBalance(page);

  // Step 1: Open Add Manual Entry
  await page.getByRole('button', { name: 'Add Manual Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Credit or Paid Invoice — "Credit" also appears in the dialog
  // heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Credit or Paid Invoice' })).toBeVisible({ timeout: 10_000 });
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

  // Step 5: Credit Details — "Creditor Name" is only the input's
  // placeholder, not an associated label, so getByLabel can't find it.
  await expect(page.getByRole('heading', { name: 'Credit Details' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByPlaceholder('Creditor Name').fill(CREDITOR_NAME);
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Transaction Date — today
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

  // Step 7: Credit Summary — verify entered data.
  // The Charter isn't shown on this screen (matches the same finding on the
  // other Charter flows in this suite), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Credit Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Credit Summary' });
  await expect(summary.getByText(formattedAmount)).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);
  await expect(summary.getByText(CREDITOR_NAME, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);
  await expect(page.getByText('Your bank account has been credited', { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: External Account balance increased by the credited amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balanceAfter = await getExternalAccountBalance(page);
  expect(balanceAfter).toBeCloseTo(balanceBefore + Number(CREDIT_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 11: Verify the new transaction appears in Manual Transactions.
  // Scoped to the enclosing article (rather than just the row) so both the
  // row and its expanded details can be checked through the same locator.
  const transactionArticle = page.getByRole('article')
    .filter({ hasText: CREDITOR_NAME })
    .filter({ hasText: formattedAmount })
    .first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  const cells = transactionArticle.getByRole('row').getByRole('cell');
  await expect(transactionArticle.getByText(CREDITOR_NAME, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(formattedAmount, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(transactionArticle.getByText('—', { exact: true })).toBeVisible(); // Subcategory — unset
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  // Charter — now set (unlike the Boat variant's unset "Select" placeholder)
  await expect(cells.last()).toHaveText(charterName);
  await page.waitForTimeout(STEP_DELAY);

  // Step 12: Expand transaction details
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Charter — verify the actual picked charter name is displayed, not just the label.
  // External Account entries label this "Charter:" (not "Charter Name:" —
  // that's the Cash Account Balances flows' label, per the "Paid Invoice"
  // test above in this same file). The row's own Charter cell already shows
  // this same value, so within this article there are two matches for it;
  // `.last()` targets the one in the expanded detail panel (rendered after
  // the row in the DOM).
  await expect(transactionArticle.getByText('Charter:')).toBeVisible();
  await expect(transactionArticle.getByText(charterName, { exact: true }).last()).toBeVisible();
  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Paid Invoice
//
// Flow:
//  1. /accounts → click "Add Manual Entry"
//  2. "Credit or Paid Invoice" screen → Paid Invoice
//  3. "Charter or Boat" screen → Boat
//  4. Fill Invoice Reference, Total Invoice Amount, Payment Date (today),
//     Category (first option), Subcategory (first option), skip Copy Of
//     Invoice, Add Notes → Next
//  5. Invoice Summary — verify all entered data
//  6. Submit
//  7. Success confirmation appears
//  8. External Account balance decreased by the invoice amount
//  9. Verify the new transaction row + expand details
// ─────────────────────────────────────────────────────────────────────────────

test('Paid Invoice', async ({ page }) => {
  test.setTimeout(90_000);

  const INVOICE_REFERENCE = 'Auto Test Paid Invoice Reference';
  const INVOICE_AMOUNT    = '1000';
  const NOTE_TEXT         = 'Test note from auto test';

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
  const formattedAmount = `${currency}${Number(INVOICE_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const balanceBefore = await getExternalAccountBalance(page);

  // Step 1: Open Add Manual Entry
  await page.getByRole('button', { name: 'Add Manual Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Credit or Paid Invoice — "Paid Invoice" also appears in the
  // dialog heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Credit or Paid Invoice' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Paid Invoice', exact: true }).first().click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 3: Charter or Boat/Operational — the label depends on the account
  // type (yacht vs plane) and also appears in the dialog heading, so
  // selectCharterOrAsset() reads it dynamically and clicks the right button.
  await expect(page.getByRole('heading', { name: /^Charter or .+$/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await selectCharterOrAsset(page, 'asset');
  await page.waitForTimeout(STEP_DELAY);

  // Step 4: Add a New Paid Invoice — scoped to the dialog, since a prior
  // staging transaction's row also exposes an accessible name/label
  // containing "Invoice Reference" (its table column header), causing a
  // strict-mode violation if the page-wide getByLabel is used.
  await expect(page.getByRole('heading', { name: 'Add a New Paid Invoice' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const invoiceDialog = page.getByRole('dialog', { name: 'Add a New Paid Invoice' });

  await invoiceDialog.getByLabel('Invoice Reference').fill(INVOICE_REFERENCE);
  await page.waitForTimeout(STEP_DELAY);

  await invoiceDialog.getByLabel('Total Invoice Amount').fill(INVOICE_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);

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

  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);

  // Copy Of Invoice — skipped (optional)

  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Invoice Summary — verify entered data
  await expect(page.getByRole('heading', { name: 'Invoice Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Invoice Summary' });
  await expect(summary.getByText(INVOICE_REFERENCE, { exact: false })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(subcategory, { exact: false })).toBeVisible();
  await expect(summary.getByText('No', { exact: true })).toBeVisible(); // Receipt — skipped
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: External Account balance decreased by the invoice amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balanceAfter = await getExternalAccountBalance(page);
  expect(balanceAfter).toBeCloseTo(balanceBefore - Number(INVOICE_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Verify the new transaction appears in Manual Transactions
  // Prior runs leave their own rows with this reference in staging — take the first match.
  // Scoped to the enclosing article so both the row and its expanded details
  // (revealed further below) can be checked through the same locator.
  const transactionArticle = page.getByRole('article').filter({ hasText: INVOICE_REFERENCE }).first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionArticle.getByText(INVOICE_REFERENCE, { exact: true })).toBeVisible();
  // Paid Invoice is a debit — shown as "-<symbol>1,000.00" in the row
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(transactionArticle.getByText(category, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(subcategory, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  // Charter column — unset placeholder, since we picked "Boat" in step 3
  await expect(transactionArticle.getByRole('row').getByRole('cell').last()).toHaveText('Select');
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Expand transaction details and verify the extra fields it reveals
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Paid Invoice', { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Charter:')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Paid Invoice (Charter)
//
// Same as "Paid Invoice" above, except "Charter or Boat" → Charter, with the
// first charter from the list picked and verified in the transaction row +
// expanded details afterwards.
//
// Flow:
//  1. /accounts → click "Add Manual Entry"
//  2. "Credit or Paid Invoice" screen → Paid Invoice
//  3. "Charter or Boat" screen → Charter
//  3b. "Choose the Charter" screen → pick first from Active Charters*
//  4. Fill Invoice Reference, Total Invoice Amount, Payment Date (today),
//     Category (first option), Subcategory (first option), skip Copy Of
//     Invoice, Add Notes → Next
//  5. Invoice Summary — verify all entered data (Charter isn't shown on this
//     screen, per the same finding on the other Charter flows in this suite)
//  6. Submit
//  7. Success confirmation appears
//  8. External Account balance decreased by the invoice amount
//  9. Verify the new transaction row + expand details (+ Charter)
// ─────────────────────────────────────────────────────────────────────────────

test('Paid Invoice (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  const INVOICE_REFERENCE = 'Paid Invoice Charter Auto Test';
  const INVOICE_AMOUNT    = '1100';
  const NOTE_TEXT         = 'Test note from auto test';

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
  const formattedAmount = `${currency}${Number(INVOICE_AMOUNT).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const balanceBefore = await getExternalAccountBalance(page);

  // Step 1: Open Add Manual Entry
  await page.getByRole('button', { name: 'Add Manual Entry' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 2: Credit or Paid Invoice — "Paid Invoice" also appears in the
  // dialog heading, so scope to buttons and take the first match.
  await expect(page.getByRole('heading', { name: 'Credit or Paid Invoice' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  await page.getByRole('button', { name: 'Paid Invoice', exact: true }).first().click();
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

  // Step 4: Add a New Paid Invoice — scoped to the dialog, since a prior
  // staging transaction's row also exposes an accessible name/label
  // containing "Invoice Reference" (its table column header), causing a
  // strict-mode violation if the page-wide getByLabel is used.
  await expect(page.getByRole('heading', { name: 'Add a New Paid Invoice' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const invoiceDialog = page.getByRole('dialog', { name: 'Add a New Paid Invoice' });

  await invoiceDialog.getByLabel('Invoice Reference').fill(INVOICE_REFERENCE);
  await page.waitForTimeout(STEP_DELAY);

  await invoiceDialog.getByLabel('Total Invoice Amount').fill(INVOICE_AMOUNT);
  await page.waitForTimeout(STEP_DELAY);

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

  const category = await selectFirstOption(page, 'Category');
  await page.waitForTimeout(STEP_DELAY);
  const subcategory = await selectFirstOption(page, 'Subcategory');
  await page.waitForTimeout(STEP_DELAY);

  // Copy Of Invoice — skipped (optional)

  await page.getByPlaceholder('Enter Note').fill(NOTE_TEXT);
  await page.waitForTimeout(STEP_DELAY);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 5: Invoice Summary — verify entered data.
  // The Charter isn't shown on this screen (matches the same finding on the
  // other Charter flows in this suite), so no assertion for it here.
  await expect(page.getByRole('heading', { name: 'Invoice Summary' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(STEP_DELAY);
  const summary = page.getByRole('dialog', { name: 'Invoice Summary' });
  await expect(summary.getByText(INVOICE_REFERENCE, { exact: false })).toBeVisible();
  await expect(summary.getByText(transactionDate, { exact: false })).toBeVisible();
  await expect(summary.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(summary.getByText(category, { exact: false })).toBeVisible();
  await expect(summary.getByText(subcategory, { exact: false })).toBeVisible();
  await expect(summary.getByText('No', { exact: true })).toBeVisible(); // Receipt — skipped
  await expect(summary.getByText(NOTE_TEXT, { exact: false })).toBeVisible();
  await page.waitForTimeout(STEP_DELAY);

  // Step 6: Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(STEP_DELAY);

  // Step 7: Success confirmation
  await expect(page.getByText('SUCCESS', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  // Step 8: External Account balance decreased by the invoice amount
  await page.reload();
  await page.waitForTimeout(STEP_DELAY);
  const balanceAfter = await getExternalAccountBalance(page);
  expect(balanceAfter).toBeCloseTo(balanceBefore - Number(INVOICE_AMOUNT), 2);
  await page.waitForTimeout(STEP_DELAY);

  // Step 9: Verify the new transaction appears in Manual Transactions
  // Prior runs leave their own rows with this reference in staging — take the first match.
  // Scoped to the enclosing article so both the row and its expanded details
  // (revealed further below) can be checked through the same locator.
  const transactionArticle = page.getByRole('article').filter({ hasText: INVOICE_REFERENCE }).first();
  await expect(transactionArticle).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionArticle.getByText(INVOICE_REFERENCE, { exact: true })).toBeVisible();
  // Paid Invoice is a debit — shown as "-<symbol>1,100.00" in the row
  await expect(transactionArticle.getByText(formattedAmount, { exact: false })).toBeVisible();
  await expect(transactionArticle.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS
  await expect(transactionArticle.getByText(category, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText(subcategory, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByRole('button', { name: 'Add' })).toBeVisible(); // Receipt
  // Charter — now set (unlike the Boat variant's unset "Select" placeholder)
  await expect(transactionArticle.getByRole('row').getByRole('cell').last()).toHaveText(charterName);
  await page.waitForTimeout(STEP_DELAY);

  // Step 10: Expand transaction details and verify the extra fields it reveals
  await transactionArticle.getByRole('button', { name: 'Expand transaction details' }).click();
  await page.waitForTimeout(STEP_DELAY);

  await expect(transactionArticle.getByText('User:')).toBeVisible();
  await expect(transactionArticle.getByText(loggedInUserName, { exact: true })).toBeVisible();
  await expect(transactionArticle.getByText('Description:')).toBeVisible();
  await expect(transactionArticle.getByText('Paid Invoice', { exact: true })).toBeVisible();
  // Charter — verify the actual picked charter name is displayed, not just the
  // label. The row's own Charter cell already shows this same value, so
  // within this article there are two matches for it; `.last()` targets the
  // one in the expanded detail panel (rendered after the row in the DOM).
  await expect(transactionArticle.getByText('Charter:')).toBeVisible();
  await expect(transactionArticle.getByText(charterName, { exact: true }).last()).toBeVisible();
});
