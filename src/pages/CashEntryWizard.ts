import { expect, type Page, type Locator } from '@playwright/test';
import { selectCharterOrAsset } from '../helpers/manual-ledger.helper';
import { selectFirstOption, selectOptionByIndex, selectNamedOption, fillMaskedInput } from '../helpers/ui.helper';
import { type DateParts } from '../fixtures/test-data';

export type EntryKind = 'Debit' | 'Credit';

/** Step headings can lag behind the click that opens them. */
const STEP_TIMEOUT = 10_000;
/** Submits hit the backend — success/close takes longer than a step change. */
const SUBMIT_TIMEOUT = 15_000;

/**
 * The multi-step "Add Cash Entry" / "Add Manual Entry" wizard drawer.
 *
 * Each method waits for its step's heading before interacting, so no hard
 * sleeps are needed between steps. Choice buttons ("Transfer", "Debit", …)
 * also appear in the dialog heading, so they're scoped to buttons with
 * exact: true and .first() — the pattern proven against this app's markup.
 */
export class CashEntryWizard {
  constructor(readonly page: Page) {}

  /** Wait for a wizard step to be on screen, identified by its heading. */
  async expectStep(heading: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('heading', { name: heading })).toBeVisible({ timeout: STEP_TIMEOUT });
  }

  async next(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  /** The wizard dialog for a given step (the dialog carries the step name as its aria-label). */
  dialog(name: string): Locator {
    return this.page.getByRole('dialog', { name });
  }

  // ── Choice screens ──────────────────────────────────────────────────────────

  /** e.g. choose('Transaction or Transfer', 'Transfer') or choose('Debit or Credit', 'Credit'). */
  async choose(heading: string | RegExp, button: string): Promise<void> {
    await this.expectStep(heading);
    await this.page.getByRole('button', { name: button, exact: true }).first().click();
  }

  /**
   * "Charter or Boat/Operational" — the second label depends on the account
   * type, so it's read dynamically. Returns the non-charter label.
   */
  async chooseCharterOrAsset(choice: 'charter' | 'asset'): Promise<string> {
    await this.expectStep(/^Charter or .+$/);
    return selectCharterOrAsset(this.page, choice);
  }

  /** "Choose the Charter" — pick the first Active Charter, return its name. */
  async pickFirstCharter(): Promise<string> {
    await this.expectStep('Choose the Charter');
    const charterName = await selectFirstOption(this.page, 'Active Charters*');
    await this.next();
    return charterName;
  }

  // ── Details screens ─────────────────────────────────────────────────────────

  /** Transfer "Debit/Credit Details" — pick the Account* option at `index`, return its name. */
  async selectAccount(kind: EntryKind, index = 0): Promise<string> {
    await this.expectStep(`${kind} Details`);
    const name = await selectOptionByIndex(this.page, 'Account*', index);
    await this.next();
    return name;
  }

  /** Transfer "Debit/Credit Details" — pick the Account* option by its exact name. */
  async selectNamedAccount(kind: EntryKind, accountName: string): Promise<void> {
    await this.expectStep(`${kind} Details`);
    await selectNamedOption(this.page, 'Account*', accountName);
    await this.next();
  }

  /**
   * Transaction "Debit Details" — a free-text Supplier Name field. Scoped to
   * the dialog: the step's aria-label collides with page-wide getByLabel.
   */
  async fillSupplierName(name: string): Promise<void> {
    await this.expectStep('Debit Details');
    await this.dialog('Debit Details').locator('input').fill(name);
    await this.next();
  }

  /** External "Credit Details" — "Creditor Name" is only the input's placeholder. */
  async fillCreditorName(name: string): Promise<void> {
    await this.expectStep('Credit Details');
    await this.page.getByPlaceholder('Creditor Name').fill(name);
    await this.next();
  }

  /**
   * "Debit/Credit Amount" — the dialog itself carries the "<kind> amount"
   * aria-label, so getByLabel would resolve to the <aside>; target the
   * dialog's input directly. Masked fill: typed decimals are dropped by a
   * plain fill, so clear → pressSequentially → blur.
   */
  async fillAmount(kind: EntryKind, amount: string): Promise<void> {
    await this.expectStep(`${kind} Amount`);
    await fillMaskedInput(this.dialog(`${kind} Amount`).locator('input'), amount);
    await this.next();
  }

  // ── Date / categorize / receipt / note ─────────────────────────────────────

  /** Pick a date on the custom Day/Month/Year buttons (no Next — Paid Invoice embeds this inline). */
  async pickDate(date: DateParts): Promise<void> {
    await this.page.getByRole('button', { name: 'Day' }).click();
    await this.page.getByRole('option', { name: date.day, exact: true }).click();
    await this.page.getByRole('button', { name: 'Month' }).click();
    await this.page.getByRole('option', { name: date.month }).click();
    await this.page.getByRole('button', { name: 'Year' }).click();
    await this.page.getByRole('option', { name: date.year, exact: true }).click();
  }

  /** The standalone "Transaction Date" step: pick the date, then Next. */
  async setDate(date: DateParts): Promise<void> {
    await this.pickDate(date);
    await this.next();
  }

  /** "Categorize Debit" — first Category, then first Subcategory, then Next. */
  async categorize(): Promise<{ category: string; subcategory: string }> {
    await this.expectStep('Categorize Debit');
    const category = await selectFirstOption(this.page, 'Category');
    const subcategory = await selectFirstOption(this.page, 'Subcategory');
    await this.next();
    return { category, subcategory };
  }

  /** "Upload Your Receipt" — skip via the "No receipt available" checkbox. */
  async skipReceipt(): Promise<void> {
    await this.expectStep('Upload Your Receipt');
    await this.page.getByRole('checkbox', { name: 'No receipt available' }).check();
    await this.next();
  }

  /** "Add a Note" step. */
  async addNote(text: string): Promise<void> {
    await this.expectStep('Add a Note');
    await this.page.getByPlaceholder('Enter Note').fill(text);
    await this.next();
  }

  /**
   * External "Add a New Paid Invoice" — one combined form (reference, amount,
   * date, category/subcategory, optional invoice copy skipped, note), then Next.
   * Scoped to the dialog: a prior staging row's table header also exposes an
   * "Invoice Reference" label, so page-wide getByLabel hits strict mode.
   */
  async fillPaidInvoiceForm(invoice: {
    reference: string;
    amount: string;
    date: DateParts;
    note: string;
  }): Promise<{ category: string; subcategory: string }> {
    await this.expectStep('Add a New Paid Invoice');
    const dialog = this.dialog('Add a New Paid Invoice');
    await dialog.getByLabel('Invoice Reference').fill(invoice.reference);
    await fillMaskedInput(dialog.getByLabel('Total Invoice Amount'), invoice.amount);
    await this.pickDate(invoice.date);
    const category = await selectFirstOption(this.page, 'Category');
    const subcategory = await selectFirstOption(this.page, 'Subcategory');
    await this.page.getByPlaceholder('Enter Note').fill(invoice.note);
    await this.next();
    return { category, subcategory };
  }

  // ── Summary & submit ────────────────────────────────────────────────────────

  /**
   * Wait for the "<name> Summary" step and assert each entry is visible inside
   * its dialog. Strings match as substrings; pass { exact: true } where a
   * substring would be ambiguous (e.g. a note that contains the supplier name).
   */
  async expectSummary(
    name: 'Debit' | 'Credit' | 'Invoice',
    entries: Array<string | { text: string; exact: boolean }>
  ): Promise<void> {
    await this.expectStep(`${name} Summary`);
    const summary = this.dialog(`${name} Summary`);
    for (const entry of entries) {
      const { text, exact } = typeof entry === 'string' ? { text: entry, exact: false } : entry;
      await expect(summary.getByText(text, { exact })).toBeVisible();
    }
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }

  /**
   * Submit and wait for the success confirmation. `detailText` additionally
   * checks flow-specific wording (e.g. "Your bank account has been credited").
   */
  async submitAndExpectSuccess(detailText?: string): Promise<void> {
    await this.submit();
    await expect(this.page.getByText(/SUCCESS/).first()).toBeVisible({ timeout: SUBMIT_TIMEOUT });
    if (detailText) {
      await expect(this.page.getByText(detailText, { exact: false })).toBeVisible();
    }
  }

  /**
   * Submit and wait for the wizard to close instead of a success screen —
   * for the Credit/Transfer flows whose success wording is unconfirmed.
   * Waiting here (rather than reloading straight away, as before) removes the
   * race where the reload cancelled an in-flight submit.
   */
  async submitAndExpectClosed(summaryName: 'Debit' | 'Credit' | 'Invoice'): Promise<void> {
    await this.submit();
    await expect(this.page.getByRole('heading', { name: `${summaryName} Summary` })).toBeHidden({ timeout: SUBMIT_TIMEOUT });
  }
}
