import { test } from '../../src/fixtures/test';
import { ManualLedgerPage, formatAmount } from '../../src/pages/ManualLedgerPage';
import { CashEntryWizard } from '../../src/pages/CashEntryWizard';
import { TransactionList } from '../../src/pages/TransactionList';
import { randAmount, todayParts, uniqueText } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Debit / Transfer)
//
// Two variants of the same flow, differing only in the "Charter or Boat"
// choice: "Boat" attaches no charter; "Charter" picks the first charter and
// verifies it in the transaction row + expanded details afterwards.
//
// Amounts are random with cents so each run's transaction is uniquely
// identifiable in the list (sub-account names are generic and reused by prior
// staging rows). Debits stay below the credit specs' amounts, which run first
// and fund the same sub-accounts.
//
// NOTE: staging may reject the submit with "...does not have enough funds..."
// if the picked sub-account can't cover the debit — the test then fails at the
// success-confirmation step.
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Debit from Subaccount (${variant})`, async ({ page }) => {
    test.setTimeout(150_000);

    const DEBIT_AMOUNT = randAmount(100, 499);
    const NOTE_TEXT = uniqueText(`Auto Test Cash debit transfer ${variant}`);
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, DEBIT_AMOUNT);

    await ledger.addCashEntry();
    await wizard.choose('Transaction or Transfer', 'Transfer');
    await wizard.choose('Debit or Credit', 'Debit');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

    const subAccountName = await wizard.selectAccount('Debit');
    // Read the sub-account's Department balance now, before the debit is
    // submitted — the underlying page (behind this drawer) is still in the DOM.
    const departmentBalanceBefore = await ledger.departmentBalance(subAccountName);

    await wizard.fillAmount('Debit', DEBIT_AMOUNT);
    await wizard.setDate(date);
    // No "Categorize Debit" step: a Transfer debit goes Date → Add a Note
    // (only the Transaction flow categorizes). DOM-verified Nov 2026.
    await wizard.addNote(NOTE_TEXT);

    // Summary shows Account Name, Transaction Date, Debit Amount, Note
    // (no Charter, no Category).
    await wizard.expectSummary('Debit', [
      { text: subAccountName, exact: true },
      date.formatted,
      formattedAmount,
      NOTE_TEXT,
    ]);
    await wizard.submitAndWaitDone('Debit');

    // The picked sub-account's Department balance decreased by the debited amount.
    await page.reload();
    await ledger.expectDepartmentBalance(subAccountName, departmentBalanceBefore - Number(DEBIT_AMOUNT));

    // The new transaction row (debit renders as "-<symbol>X,XXX.XX").
    const article = await transactions.locate(subAccountName, formattedAmount);
    await transactions.expectRow(article, {
      name: subAccountName,
      amount: formattedAmount,
      category: 'Select', // debit rows: category is picked in the row (button), not the wizard
      subcategory: '—',
      ...(variant === 'Charter' ? { charterCell: charterName } : {}),
    });

    await transactions.expandDetails(article);
    await transactions.expectDetails(article, {
      charterLabel: 'Charter:', // Boat variant: label-only (charter optional)
      charterName,
      user: loggedInUserName,
      description: 'Cash Debit Transfer',
    });
  });
}
