import { test } from '@playwright/test';
import { ManualLedgerPage, formatAmount } from '../../src/pages/ManualLedgerPage';
import { CashEntryWizard } from '../../src/pages/CashEntryWizard';
import { TransactionList } from '../../src/pages/TransactionList';
import { randAmount, todayParts } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Credit / Transfer)
//
// Three variants of the same flow:
//   - "Boat"        → Main Cash Account (checks Total/Remaining Balance)
//   - "Sub-account" → first sub-account after Main Cash Account
//                     (checks that sub-account's own Department balance)
//   - "Charter"     → picks "Charter" and the first charter from the list;
//                     verifies it in the row + expanded details afterwards
//
// The Credit flow has no confirmed success-confirmation wording, so after
// Submit the wizard waits for the summary to close before reloading (reloading
// straight away used to race — and could cancel — the in-flight submit), and
// the balance checks poll until the backend has settled.
//
// Amounts are random with cents so each run's transaction is uniquely
// identifiable in the list. These credits also fund the sub-accounts the debit
// specs draw from afterwards.
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

const CASH_ACCOUNT = 'Main Cash Account';

test('Credit to Main Cash Account (Boat)', async ({ page }) => {
  test.setTimeout(90_000);

  const CREDIT_AMOUNT = randAmount(2000, 2999);
  const date = todayParts();

  const ledger = new ManualLedgerPage(page);
  const wizard = new CashEntryWizard(page);
  const transactions = new TransactionList(page);

  await ledger.open();
  const loggedInUserName = await ledger.loggedInUserName();
  const currency = await ledger.currencySymbol();
  const formattedAmount = formatAmount(currency, CREDIT_AMOUNT);
  const balancesBefore = await ledger.cashBalances();

  await ledger.addCashEntry();
  await wizard.choose('Transaction or Transfer', 'Transfer');
  await wizard.choose('Debit or Credit', 'Credit');
  await wizard.chooseCharterOrAsset('asset');
  await wizard.selectNamedAccount('Credit', CASH_ACCOUNT);
  await wizard.fillAmount('Credit', CREDIT_AMOUNT);
  await wizard.setDate(date);

  await wizard.expectSummary('Credit', [CASH_ACCOUNT, formattedAmount, date.formatted]);
  await wizard.submitAndExpectClosed('Credit');

  // Total and Remaining Balance increased by the credited amount.
  await page.reload();
  await ledger.expectCashBalances({
    total: balancesBefore.total + Number(CREDIT_AMOUNT),
    remaining: balancesBefore.remaining + Number(CREDIT_AMOUNT),
  });

  const article = transactions.articleFor(CASH_ACCOUNT, formattedAmount);
  await transactions.expectRow(article, {
    name: CASH_ACCOUNT,
    amount: formattedAmount,
    category: 'N/A', // Category/Subcategory — not applicable to cash entries
    subcategory: 'N/A',
    charterCell: 'Select', // Charter — unset placeholder
  });

  await transactions.expandDetails(article);
  await transactions.expectDetails(article, {
    charterLabel: 'Charter Name:', // label-only (charter optional)
    user: loggedInUserName,
    description: 'Cash Credit Transfer',
  });
});

test('Credit to a sub-account', async ({ page }) => {
  test.setTimeout(90_000);

  const CREDIT_AMOUNT = randAmount(2000, 2999);
  const date = todayParts();

  const ledger = new ManualLedgerPage(page);
  const wizard = new CashEntryWizard(page);
  const transactions = new TransactionList(page);

  await ledger.open();
  const loggedInUserName = await ledger.loggedInUserName();
  const currency = await ledger.currencySymbol();
  const formattedAmount = formatAmount(currency, CREDIT_AMOUNT);

  await ledger.addCashEntry();
  await wizard.choose('Transaction or Transfer', 'Transfer');
  await wizard.choose('Debit or Credit', 'Credit');
  await wizard.chooseCharterOrAsset('asset');
  // Index 0 = Main Cash Account; 1 = first real sub-account.
  const subAccountName = await wizard.selectAccount('Credit', 1);
  // Read the sub-account's Department balance now, before the credit is
  // submitted — the underlying page (behind this drawer) is still in the DOM.
  const departmentBalanceBefore = await ledger.departmentBalance(subAccountName);

  await wizard.fillAmount('Credit', CREDIT_AMOUNT);
  await wizard.setDate(date);

  await wizard.expectSummary('Credit', [
    { text: subAccountName, exact: true },
    formattedAmount,
    date.formatted,
  ]);
  await wizard.submitAndExpectClosed('Credit');

  // The sub-account's own Department balance increased by the credited amount.
  await page.reload();
  await ledger.expectDepartmentBalance(subAccountName, departmentBalanceBefore + Number(CREDIT_AMOUNT));

  const article = transactions.articleFor(subAccountName, formattedAmount);
  await transactions.expectRow(article, {
    name: subAccountName,
    amount: formattedAmount,
    category: 'N/A',
    subcategory: 'N/A',
    charterCell: 'Select',
  });

  await transactions.expandDetails(article);
  await transactions.expectDetails(article, {
    charterLabel: 'Charter Name:',
    user: loggedInUserName,
    description: 'Cash Credit Transfer',
  });
});

test('Credit to Main Cash Account (Charter)', async ({ page }) => {
  test.setTimeout(90_000);

  const CREDIT_AMOUNT = randAmount(2000, 2999);
  const date = todayParts();

  const ledger = new ManualLedgerPage(page);
  const wizard = new CashEntryWizard(page);
  const transactions = new TransactionList(page);

  await ledger.open();
  const loggedInUserName = await ledger.loggedInUserName();
  const currency = await ledger.currencySymbol();
  const formattedAmount = formatAmount(currency, CREDIT_AMOUNT);
  const balancesBefore = await ledger.cashBalances();

  await ledger.addCashEntry();
  await wizard.choose('Transaction or Transfer', 'Transfer');
  await wizard.choose('Debit or Credit', 'Credit');
  await wizard.chooseCharterOrAsset('charter');
  const charterName = await wizard.pickFirstCharter();
  await wizard.selectNamedAccount('Credit', CASH_ACCOUNT);
  await wizard.fillAmount('Credit', CREDIT_AMOUNT);
  await wizard.setDate(date);

  // The Charter isn't shown on the summary screen, so no assertion for it here.
  await wizard.expectSummary('Credit', [CASH_ACCOUNT, formattedAmount, date.formatted]);
  await wizard.submitAndExpectClosed('Credit');

  await page.reload();
  await ledger.expectCashBalances({
    total: balancesBefore.total + Number(CREDIT_AMOUNT),
    remaining: balancesBefore.remaining + Number(CREDIT_AMOUNT),
  });

  const article = transactions.articleFor(CASH_ACCOUNT, formattedAmount);
  await transactions.expectRow(article, {
    name: CASH_ACCOUNT,
    amount: formattedAmount,
    category: 'N/A',
    subcategory: 'N/A',
    charterCell: charterName, // Charter — now set (unlike the Boat variant)
  });

  await transactions.expandDetails(article);
  await transactions.expectDetails(article, {
    charterLabel: 'Charter Name:',
    charterName,
    user: loggedInUserName,
    description: 'Cash Credit Transfer',
  });
});
