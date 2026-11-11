import { expect, test } from '../../src/fixtures/test';
import { ManualLedgerPage, formatAmount } from '../../src/pages/ManualLedgerPage';
import { CashEntryWizard } from '../../src/pages/CashEntryWizard';
import { TransactionList } from '../../src/pages/TransactionList';
import { randAmount, todayParts, uniqueText } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — External Account — Add Manual Entry (Credit / Paid Invoice)
//
// Four tests: Credit and Paid Invoice, each in a Boat and a Charter variant.
// Creditor names / invoice references are run-unique, so rows left behind by
// prior staging runs never collide with this run's list filters.
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ── Credit ───────────────────────────────────────────────────────────────────
// Flow: Add Manual Entry → Credit → Boat/Charter (+ first charter) → Amount →
// Creditor Name → Date → Summary → Submit → success → balance ↑ → row + details.

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Credit (${variant})`, async ({ page }) => {
    test.setTimeout(150_000);

    const CREDIT_AMOUNT = randAmount(1000, 1999);
    const CREDITOR_NAME = uniqueText(`Auto test ${variant}`);
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, CREDIT_AMOUNT);
    const balanceBefore = await ledger.externalBalance();

    await ledger.addManualEntry();
    await wizard.choose('Credit or Paid Invoice', 'Credit');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

    await wizard.fillAmount('Credit', CREDIT_AMOUNT);
    await wizard.fillCreditorName(CREDITOR_NAME);
    await wizard.setDate(date);

    // The Charter isn't shown on the summary screen, so no assertion for it here.
    await wizard.expectSummary('Credit', [formattedAmount, CREDITOR_NAME, date.formatted]);
    await wizard.submitAndWaitDone('Credit');

    // External Account balance increased by the credited amount.
    await page.reload();
    await ledger.expectExternalBalance(balanceBefore + Number(CREDIT_AMOUNT));

    const article = await transactions.locate(CREDITOR_NAME, formattedAmount);
    await transactions.expectRow(article, {
      name: CREDITOR_NAME,
      amount: formattedAmount,
      subcategoryDash: true, // Subcategory — unset on External Account credits
      ...(variant === 'Charter' ? { charterCell: charterName } : {}),
    });

    await transactions.expandDetails(article);
    await transactions.expectDetails(article, {
      ...(variant === 'Charter' ? { charterLabel: 'Charter:' as const, charterName } : {}),
      user: loggedInUserName,
    });
  });
}

// ── Paid Invoice ─────────────────────────────────────────────────────────────
// Flow: Add Manual Entry → Paid Invoice → Boat/Charter (+ first charter) →
// combined invoice form (reference, amount, date, category/subcategory, note;
// Copy Of Invoice skipped) → Invoice Summary → Submit → success → balance ↓ →
// row + details.

for (const variant of ['Boat', 'Charter'] as const) {
  test(`Paid Invoice${variant === 'Charter' ? ' (Charter)' : ''}`, async ({ page }) => {
    test.setTimeout(150_000);

    const INVOICE_AMOUNT = randAmount(500, 999);
    const INVOICE_REFERENCE = uniqueText(`Auto Test Paid Invoice ${variant}`);
    const NOTE_TEXT = uniqueText('Test note from auto test');
    const date = todayParts();

    const ledger = new ManualLedgerPage(page);
    const wizard = new CashEntryWizard(page);
    const transactions = new TransactionList(page);

    await ledger.open();
    const loggedInUserName = await ledger.loggedInUserName();
    const currency = await ledger.currencySymbol();
    const formattedAmount = formatAmount(currency, INVOICE_AMOUNT);
    const balanceBefore = await ledger.externalBalance();

    await ledger.addManualEntry();
    await wizard.choose('Credit or Paid Invoice', 'Paid Invoice');
    await wizard.chooseCharterOrAsset(variant === 'Charter' ? 'charter' : 'asset');
    const charterName = variant === 'Charter' ? await wizard.pickFirstCharter() : undefined;

    const { category, subcategory } = await wizard.fillPaidInvoiceForm({
      reference: INVOICE_REFERENCE,
      amount: INVOICE_AMOUNT,
      date,
      note: NOTE_TEXT,
    });

    // The Charter isn't shown on the summary screen, so no assertion for it here.
    await wizard.expectSummary('Invoice', [
      INVOICE_REFERENCE,
      date.formatted,
      formattedAmount,
      category,
      subcategory,
      { text: 'No', exact: true }, // Copy Of Invoice — skipped
      NOTE_TEXT,
    ]);
    await wizard.submitAndWaitDone('Invoice');

    // External Account balance decreased by the invoice amount.
    await page.reload();
    await ledger.expectExternalBalance(balanceBefore - Number(INVOICE_AMOUNT));

    // Paid Invoice is a debit — the row shows "-<symbol>X.XX".
    const article = await transactions.locate(INVOICE_REFERENCE, formattedAmount);
    await transactions.expectRow(article, {
      name: INVOICE_REFERENCE,
      amount: formattedAmount,
      charterCell: variant === 'Charter' ? charterName : 'Select',
    });
    // External rows place Category/Subcategory differently from cash rows —
    // assert by text rather than by cell index.
    await expect(article.getByText(category, { exact: true })).toBeVisible();
    await expect(article.getByText(subcategory, { exact: true })).toBeVisible();

    await transactions.expandDetails(article);
    await transactions.expectDetails(article, {
      charterLabel: 'Charter:', // Boat variant: label-only (charter optional)
      charterName,
      user: loggedInUserName,
      description: 'Paid Invoice',
    });
  });
}
