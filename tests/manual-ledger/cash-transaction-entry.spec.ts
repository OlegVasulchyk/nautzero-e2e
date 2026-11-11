import { test } from '../../src/fixtures/test';
import { ManualLedgerPage, formatAmount } from '../../src/pages/ManualLedgerPage';
import { CashEntryWizard } from '../../src/pages/CashEntryWizard';
import { TransactionList } from '../../src/pages/TransactionList';
import { randAmount, todayParts, uniqueText } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash Account Balances — Add Cash Entry (Transaction)
//
// Unlike the Transfer flow, "Transaction" skips the "Debit or Credit" screen
// (a Transaction is always a debit/expense), and its "Debit Details" step is
// a free-text Supplier Name field rather than an account dropdown.
//
// Two variants, differing only in the "Charter or Boat" choice: "Boat"
// attaches no charter; "Charter" picks the first charter and verifies it in
// the expanded transaction details afterwards (the Debit Summary doesn't show
// the Charter, so there's no assertion for it there).
//
// TODO: known bug — Cash Account Balances (Total/Remaining) don't update as
// expected after a Transaction debit, so there is no balance check in this
// spec until that's fixed.
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Transaction (${variant})`, async ({ page }) => {
    test.setTimeout(150_000);

    const SUPPLIER_NAME = uniqueText(`Auto Test Supplier ${variant}`);
    const DEBIT_AMOUNT = randAmount(100, 299);
    const NOTE_TEXT = `${SUPPLIER_NAME} Note`;
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, DEBIT_AMOUNT);

    await ledger.addCashEntry();
    await wizard.choose('Transaction or Transfer', 'Transaction');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

    await wizard.fillSupplierName(SUPPLIER_NAME);
    await wizard.setDate(date);
    await wizard.fillAmount('Debit', DEBIT_AMOUNT);
    const { category, subcategory } = await wizard.categorize();
    await wizard.skipReceipt();
    await wizard.addNote(NOTE_TEXT);

    // exact: true on supplier/note — NOTE_TEXT starts with SUPPLIER_NAME, so a
    // substring match on the supplier would also match the Note field.
    await wizard.expectSummary('Debit', [
      { text: SUPPLIER_NAME, exact: true },
      date.formatted,
      formattedAmount,
      { text: 'No', exact: true }, // Receipt — skipped
      { text: NOTE_TEXT, exact: true },
    ]);
    await wizard.submitAndWaitDone('Debit');

    // Refresh so the Manual Transactions list shows the new row.
    await page.reload();

    const article = await transactions.locate(SUPPLIER_NAME, formattedAmount);
    await transactions.expectRow(article, {
      name: SUPPLIER_NAME,
      amount: formattedAmount, // debit renders as "-<symbol>X.XX"
      category,
      subcategory,
      receiptButton: false, // the original flow never asserted a receipt button here
    });

    await transactions.expandDetails(article);
    await transactions.expectDetails(article, {
      ...(variant === 'Charter' ? { charterLabel: 'Charter:' as const, charterName } : {}),
      user: loggedInUserName,
    });
  });
}
