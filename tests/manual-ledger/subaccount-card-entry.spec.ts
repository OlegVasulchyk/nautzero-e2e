import { test } from '../../src/fixtures/test';
import { ManualLedgerPage, formatAmount } from '../../src/pages/ManualLedgerPage';
import { CashEntryWizard } from '../../src/pages/CashEntryWizard';
import { TransactionList } from '../../src/pages/TransactionList';
import { randAmount, todayParts, uniqueText } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Cash entry via a sub-account's own Department card
//
// Unlike the other Cash Account Balances specs (which start from the
// "Add Cash Entry" button → "Transaction or Transfer" → Transfer), this
// entry point is the sub-account's own clickable Department balance card
// ("Open manual entry for <name>"). Clicking it jumps straight to
// "Debit or Credit" — a card click is always a cash transfer scoped to that
// sub-account, so the account-picker step is skipped too.
//
// Four variants (Credit / Debit × Boat-or-Operational / Charter), in this
// order deliberately: Credit tests run first so the sub-account has funds in
// it by the time the Debit tests run against the same account (this suite hit
// a real "insufficient funds" case when Debit ran first against a fresh £0.00
// department). This relies on workers: 1 / fullyParallel: false in
// playwright.config.ts.
//
// Credit flows have no confirmed success wording — after Submit the wizard
// waits for the summary to close, then the balance check polls (reloading
// straight away used to race the in-flight submit).
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Sub-account Cash Credit (${variant})`, async ({ page }) => {
    test.setTimeout(150_000);

    const CREDIT_AMOUNT = randAmount(2000, 2999);
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, CREDIT_AMOUNT);

    // Read the first Department card's name + balance BEFORE clicking it.
    const subAccountName = await ledger.firstDepartmentName();
    const departmentBalanceBefore = await ledger.departmentBalance(subAccountName);
    await ledger.openDepartmentCard(subAccountName);

    await wizard.choose('Debit or Credit', 'Credit');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

    await wizard.fillAmount('Credit', CREDIT_AMOUNT);
    await wizard.setDate(date);

    // The Charter isn't shown on the summary screen, so no assertion for it here.
    await wizard.expectSummary('Credit', [
      { text: subAccountName, exact: true },
      formattedAmount,
      date.formatted,
    ]);
    await wizard.submitAndWaitDone('Credit');

    // The sub-account's own Department balance increased by the credited amount.
    await page.reload();
    await ledger.expectDepartmentBalance(subAccountName, departmentBalanceBefore + Number(CREDIT_AMOUNT));

    const article = await transactions.locate(subAccountName, formattedAmount);
    await transactions.expectRow(article, {
      name: subAccountName,
      amount: formattedAmount,
      category: 'N/A', // Category/Subcategory — not applicable to cash entries
      subcategory: 'N/A',
      charterCell: variant === 'Charter' ? charterName : 'Select',
    });

    await transactions.expandDetails(article);
    await transactions.expectDetails(article, {
      charterLabel: 'Charter Name:', // Boat variant: label-only (charter optional)
      charterName,
      user: loggedInUserName,
      description: 'Cash Credit Transfer',
    });
  });
}

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Sub-account Cash Debit (${variant})`, async ({ page }) => {
    test.setTimeout(150_000);

    const DEBIT_AMOUNT = randAmount(100, 499);
    const NOTE_TEXT = uniqueText(`Auto Test Sub-account Card Debit ${variant}`);
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, DEBIT_AMOUNT);

    // Read the first Department card's name + balance BEFORE clicking it.
    const subAccountName = await ledger.firstDepartmentName();
    const departmentBalanceBefore = await ledger.departmentBalance(subAccountName);
    await ledger.openDepartmentCard(subAccountName);

    await wizard.choose('Debit or Credit', 'Debit');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

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

    // The sub-account's own Department balance decreased by the debited amount.
    await page.reload();
    await ledger.expectDepartmentBalance(subAccountName, departmentBalanceBefore - Number(DEBIT_AMOUNT));

    const article = await transactions.locate(subAccountName, formattedAmount);
    await transactions.expectRow(article, {
      name: subAccountName,
      amount: formattedAmount, // debit renders as "-<symbol>X,XXX.XX"
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
