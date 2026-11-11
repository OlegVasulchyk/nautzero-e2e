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

  /** The "Manual transactions" region (scopes rows away from anything else on the page). */
  get region(): Locator {
    return this.page.getByRole('region', { name: 'Manual transactions', exact: true });
  }

  /**
   * Narrow the list to TODAY via the "Dates" filter (calendar → "Today, …" →
   * Save). Needed because the list is paginated (10 rows/page, 100+ pages) and
   * staging holds future-dated seed rows that sit ABOVE today's entries, so a
   * fresh transaction is usually not on page 1.
   */
  async filterToday(): Promise<void> {
    await this.page.getByRole('button', { name: 'Dates' }).click();
    await this.page.getByRole('button', { name: /^Today,/ }).click();
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** The list's search box matches the Merchant/name column ONLY (not amounts). */
  async search(name: string): Promise<void> {
    await this.page.getByRole('searchbox', { name: 'Search' }).fill(name);
  }

  /**
   * The article for the transaction matching ALL given text filters
   * (substring match) among the rows currently listed.
   */
  articleFor(...filters: string[]): Locator {
    let article = this.region.getByRole('article');
    for (const text of filters) {
      article = article.filter({ hasText: text });
    }
    return article.first();
  }

  /**
   * Find the transaction this test just created: filter the list to today,
   * search by its name, then match the (run-unique) amount — generic names
   * like a sub-account or "Main Cash Account" are shared by many rows.
   * Call after page.reload() (a reload resets the filters).
   */
  async locate(name: string, amount: string): Promise<Locator> {
    await this.filterToday();
    await this.search(name);
    return this.articleFor(name, amount);
  }

  async expectRow(
    article: Locator,
    row: {
      /** Account / supplier / creditor / reference shown in the row (exact). */
      name: string;
      /** Formatted amount, e.g. "€2,134.57" (substring — some rows render it as "-€2,134.57"). */
      amount: string;
      /**
       * Category + Subcategory cells. DOM-verified: transfer CREDIT rows show
       * "N/A"/"N/A"; transfer DEBIT rows show a "Select" button and "—" (the
       * category is picked in the row afterwards, not in the wizard).
       */
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
