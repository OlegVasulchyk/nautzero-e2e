import { expect, type Page, type Locator } from '@playwright/test';

/** Column indices in a Manual Transactions row (named so specs don't carry magic nth()s). */
const COLUMN = {
  category: 3,
  subcategory: 4,
} as const;

/** How long to wait for a freshly submitted transaction to appear in the list. */
const ROW_TIMEOUT = 15_000;

/**
 * The "Manual Transactions" list on /accounts. Each transaction renders as an
 * article containing its row and (after expanding) a details panel, so both
 * are checked through the same article locator.
 */
export class TransactionList {
  constructor(readonly page: Page) {}

  /**
   * The article for the transaction matching ALL given text filters
   * (substring match). Generic names (sub-accounts, "Main Cash Account") are
   * reused by prior staging rows, so always filter by the (unique) amount too.
   */
  articleFor(...filters: string[]): Locator {
    let article = this.page.getByRole('article');
    for (const text of filters) {
      article = article.filter({ hasText: text });
    }
    return article.first();
  }

  async expectRow(
    article: Locator,
    row: {
      /** Account / supplier / creditor / reference shown in the row (exact). */
      name: string;
      /** Formatted amount, e.g. "€2,134.57" (substring — debits render as "-€2,134.57"). */
      amount: string;
      /** Category + Subcategory cells; cash entries show "N/A" in both. */
      category?: string;
      subcategory?: string;
      /** External Account rows show "—" for the unset subcategory. */
      subcategoryDash?: boolean;
      /** Last (Charter) cell: the charter name, or "Select" when unset. Omit to skip. */
      charterCell?: string;
      /** The "Add" receipt button (default: checked). */
      receiptButton?: boolean;
    }
  ): Promise<void> {
    await expect(article).toBeVisible({ timeout: ROW_TIMEOUT });

    const cells = article.getByRole('row').getByRole('cell');
    await expect(article.getByText(row.name, { exact: true })).toBeVisible();
    await expect(article.getByText(row.amount, { exact: false })).toBeVisible();
    await expect(article.getByText('settled', { exact: true })).toBeVisible(); // shown capitalized via CSS

    if (row.category !== undefined) await expect(cells.nth(COLUMN.category)).toHaveText(row.category);
    if (row.subcategory !== undefined) await expect(cells.nth(COLUMN.subcategory)).toHaveText(row.subcategory);
    if (row.subcategoryDash) await expect(article.getByText('—', { exact: true })).toBeVisible();
    if (row.receiptButton !== false) await expect(article.getByRole('button', { name: 'Add' })).toBeVisible();
    if (row.charterCell !== undefined) await expect(cells.last()).toHaveText(row.charterCell);
  }

  async expandDetails(article: Locator): Promise<void> {
    await article.getByRole('button', { name: 'Expand transaction details' }).click();
  }

  /**
   * Assert the expanded details panel. When a charter name is given, the row's
   * own Charter cell shows the same value, so `.last()` targets the details
   * panel's copy (rendered after the row in the DOM).
   */
  async expectDetails(
    article: Locator,
    details: {
      /** Cash flows label this "Charter Name:", External/debit flows "Charter:". */
      charterLabel?: 'Charter:' | 'Charter Name:';
      /** The picked charter's name — omit for Boat variants (label-only check). */
      charterName?: string;
      /** Logged-in user's display name shown next to "User:". */
      user: string;
      /** Exact Description value, e.g. "Cash Debit Transfer" / "Paid Invoice". */
      description?: string;
    }
  ): Promise<void> {
    if (details.charterLabel) {
      await expect(article.getByText(details.charterLabel)).toBeVisible();
    }
    if (details.charterName) {
      await expect(article.getByText(details.charterName, { exact: true }).last()).toBeVisible();
    }
    await expect(article.getByText('User:')).toBeVisible();
    await expect(article.getByText(details.user, { exact: true })).toBeVisible();
    await expect(article.getByText('Description:')).toBeVisible();
    if (details.description) {
      await expect(article.getByText(details.description, { exact: true })).toBeVisible();
    }
  }
}
