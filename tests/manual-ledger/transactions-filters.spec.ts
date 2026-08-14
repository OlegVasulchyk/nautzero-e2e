import { test, expect } from '@playwright/test';
import { authState } from '../../src/fixtures/users';
import {
  NO_RESULTS_TEXT,
  selectFilterOption,
  readDropdownOptions,
  resetFilters,
  transactionRows,
  waitForFilterToSettle,
  ensureExpanded,
  expandFirst,
  getFieldValue,
} from '../../src/helpers/manual-ledger.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Manual Ledger — Manual Transactions — filter controls
//
// The filter row above the Manual Transactions table is seven independent
// controls, not one shared filter: "All Transactions", "Cash Transactions",
// "Cash Transfer", "Bank Transactions", "Charter Transactions" (each its own
// dropdown), plus "Dates" (a calendar — untouched here), "Filter"
// (Receipt/No receipt/Uncategorized), "Category", and free-text "Search".
//
// ORDERING: like transactions-report-download.spec.ts, this file must run
// LAST among the manual-ledger specs — it reads sub-account/charter names
// and transaction Descriptions that only exist once the cash-*, external-*,
// and subaccount-* specs have created them. Filename sort (workers:1,
// fullyParallel:false — see playwright.config.ts) puts "transactions-*"
// after "cash-*"/"external-*"/"subaccount-*", so this is satisfied as long
// as the file keeps its current name.
//
// Every check tolerates the account genuinely having no matching data yet —
// filtering to zero rows is only a bug if the "no results" empty state
// doesn't show up; a populated result is checked for correctness, an empty
// one is checked for the empty state, per test below.
//
// Shared plumbing (dropdown lookup, settle-waits, row expansion, reading a
// panel field) lives in src/helpers/manual-ledger.helper.ts — this file only
// has what's specific to one test.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ storageState: authState('yacht-admin') });

test.beforeEach(async ({ page }) => {
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Manual Transactions' })).toBeVisible();
});

// A reload here happens whether the test passed or failed — afterEach always
// runs, unlike a reset call written as the last line of a test body, which
// gets skipped the moment an earlier assertion in that same test throws.
test.afterEach(async ({ page }) => {
  await page.reload().catch(() => {}); // page/context may already be gone if the test crashed hard
});

// ── 1. All Transactions ─────────────────────────────────────────────────────
test('All Transactions filter — "No Charter Transactions" then back to "All Transactions"', async ({ page }) => {
  await selectFilterOption(page, 'All Transactions', 'No Charter Transactions');
  const noCharterCount = await waitForFilterToSettle(page);

  if (noCharterCount === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    const rows = transactionRows(page);
    for (let i = 0; i < noCharterCount; i++) {
      const cells = rows.nth(i).getByRole('row').getByRole('cell');
      await expect(cells.last()).toHaveText('Select'); // Charter column — unset
    }
  }

  // "Back to All Transactions" — a reload lands there by default, same as
  // clicking the option would, without depending on the dropdown at all.
  // The result is a superset — the list should refresh to at least as many
  // rows as the "No Charter" view had.
  await resetFilters(page);
  const allCount = await waitForFilterToSettle(page);
  expect(allCount).toBeGreaterThanOrEqual(noCharterCount);
});

// ── 2. Cash Transactions ────────────────────────────────────────────────────
test('Cash Transactions filter — selecting a sub-account shows only its transactions', async ({ page }) => {
  const options = (await readDropdownOptions(page, 'Cash Transactions')).filter((o) => o !== 'All Cash Transactions');
  test.skip(options.length === 0, 'No sub-account transactions on this account yet');

  const subAccount = options[options.length - 1]; // "last" sub-account we worked with — never hardcoded, this account's own name varies per environment
  await selectFilterOption(page, 'Cash Transactions', subAccount);
  const count = await waitForFilterToSettle(page);

  if (count === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    // Merchant is the vendor name ("BB"), not the sub-account — the row
    // text alone doesn't say which account a transaction belongs to.
    // Expanding it does: the panel has an "Account:" field with the real
    // sub-account name (confirmed live). Check the first 5 rows — a missing
    // "Account:" field is a real failure, not treated as "not applicable".
    const rows = transactionRows(page);
    const checkCount = Math.min(count, 5);
    for (let i = 0; i < checkCount; i++) {
      const article = rows.nth(i);
      await ensureExpanded(article);
      const account = await getFieldValue(article, 'Account:');
      expect(account).toBe(subAccount);
    }
  }
});

// ── 3. Cash Transfer ────────────────────────────────────────────────────────
test('Cash Transfer filter — All/Credits/Debits/sub-account show the correct Description', async ({ page }) => {
  // All Cash Transfer — either a Credit or a Debit transfer
  await selectFilterOption(page, 'Cash Transfer', 'All Cash Transfer');
  if (await waitForFilterToSettle(page) > 0) {
    const article = await expandFirst(transactionRows(page));
    await expect(
      article.getByText('Cash Debit Transfer', { exact: true })
        .or(article.getByText('Cash Credit Transfer', { exact: true }))
    ).toBeVisible();
  } else {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  }

  // All Credits — always a Credit transfer. Check the first 3 rows (or
  // fewer, if that's all there are), not just the first.
  await selectFilterOption(page, 'Cash Transfer', 'All Credits');
  let count = await waitForFilterToSettle(page);
  if (count === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    const rows = transactionRows(page);
    const checkCount = Math.min(count, 3);
    for (let i = 0; i < checkCount; i++) {
      const article = rows.nth(i);
      await ensureExpanded(article);
      await expect(article.getByText('Cash Credit Transfer', { exact: true })).toBeVisible();
    }
  }

  // All Debits — always a Debit transfer. Same first-3-or-fewer check.
  await selectFilterOption(page, 'Cash Transfer', 'All Debits');
  count = await waitForFilterToSettle(page);
  if (count === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    const rows = transactionRows(page);
    const checkCount = Math.min(count, 3);
    for (let i = 0; i < checkCount; i++) {
      const article = rows.nth(i);
      await ensureExpanded(article);
      await expect(article.getByText('Cash Debit Transfer', { exact: true })).toBeVisible();
    }
  }

  // The sub-account we worked with — for Cash Transfer entries the Merchant
  // column IS the sub-account name (confirmed live: every row read "Captain"
  // — never hardcoded here, this account's own name varies per environment),
  // so this can be checked straight off the collapsed row, no expanding
  // needed. Check every visible row, not just a handful, since it's cheap.
  const subAccountOptions = (await readDropdownOptions(page, 'Cash Transfer'))
    .filter((o) => !['All Cash Transfer', 'All Credits', 'All Debits'].includes(o));
  if (subAccountOptions.length > 0) {
    const subAccount = subAccountOptions[subAccountOptions.length - 1];
    await selectFilterOption(page, 'Cash Transfer', subAccount);
    count = await waitForFilterToSettle(page);
    if (count === 0) {
      await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
    } else {
      const rows = transactionRows(page);
      for (let i = 0; i < count; i++) {
        const merchantCell = rows.nth(i).getByRole('row').getByRole('cell').first();
        await expect(merchantCell).toHaveText(subAccount);
      }
    }
  }
});

// ── 4. Bank Transactions ────────────────────────────────────────────────────
test('Bank Transactions filter — Paid Invoices and Credits show the correct Description', async ({ page }) => {
  await selectFilterOption(page, 'Bank Transactions', 'Paid Invoices');
  let count = await waitForFilterToSettle(page);
  if (count === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    const rows = transactionRows(page);
    for (let i = 0; i < Math.min(count, 2); i++) {
      const article = rows.nth(i);
      await ensureExpanded(article);
      await expect(article.getByText('Paid Invoice', { exact: true })).toBeVisible();
    }
  }

  await selectFilterOption(page, 'Bank Transactions', 'Credits');
  count = await waitForFilterToSettle(page);
  if (count === 0) {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  } else {
    const article = await expandFirst(transactionRows(page));
    await expect(article.getByText('Bank Credit', { exact: true })).toBeVisible();
  }
});

// ── 5. Charter Transactions ─────────────────────────────────────────────────
// The label isn't consistent across transaction types — confirmed live: a
// Cash Transfer entry says "Charter Name:", a Paid Invoice entry says just
// "Charter:", and some other types show no charter field at all when
// expanded even though the row is correctly included in this filter.
const CHARTER_FIELD_LABELS = ['Charter Name:', 'Charter:'];

test('Charter Transactions filter — every listed transaction matches the selected charter', async ({ page }) => {
  const charters = (await readDropdownOptions(page, 'Charter Transactions')).filter((o) => o !== 'All Charter Transactions');

  let matchedCharter: string | null = null;
  let count = 0;
  for (const charter of charters) {
    await selectFilterOption(page, 'Charter Transactions', charter);
    count = await waitForFilterToSettle(page);
    if (count > 0) {
      matchedCharter = charter;
      break;
    }
  }
  test.skip(matchedCharter === null, 'No charter currently has any transactions on this account');

  // Check every row that actually appeared, not just the first — expand
  // each, and if it has a charter field at all (either label), that field's
  // value must be exactly the charter we filtered by. A row with no charter
  // field at all is allowed (that transaction type just doesn't show one),
  // but a present field with the WRONG value is a real failure.
  const rows = transactionRows(page);
  for (let i = 0; i < count; i++) {
    const article = rows.nth(i);
    await ensureExpanded(article);

    let label: string | null = null;
    for (const candidate of CHARTER_FIELD_LABELS) {
      if (await article.getByText(candidate, { exact: true }).isVisible()) {
        label = candidate;
        break;
      }
    }
    if (label) {
      const value = await getFieldValue(article, label);
      expect(value).toBe(matchedCharter);
    }
  }
});

// ── 6. Filter (Receipt / No receipt / Uncategorized) ────────────────────────
test('Filter dropdown — Receipt, No receipt, and Uncategorized', async ({ page }) => {
  const dropdown = 'Filter';

  // Receipt — first row should show the receipt icon, not the "Add" button
  await selectFilterOption(page, dropdown, 'Receipt');
  if (await waitForFilterToSettle(page) > 0) {
    await expect(transactionRows(page).first().getByRole('button', { name: 'Add', exact: true })).not.toBeVisible();
  } else {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  }

  // No receipt — first row should show the "Add" button instead
  await selectFilterOption(page, dropdown, 'No receipt');
  if (await waitForFilterToSettle(page) > 0) {
    await expect(transactionRows(page).first().getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(NO_RESULTS_TEXT, { exact: false })).toBeVisible();
  }

  // Uncategorized — check every row on the page: Category is either the
  // unset "Select" combobox or "N/A" (not applicable to that entry type).
  await selectFilterOption(page, dropdown, 'Uncategorized');
  const count = await waitForFilterToSettle(page);
  const rows = transactionRows(page);
  for (let i = 0; i < count; i++) {
    const categoryCell = rows.nth(i).getByRole('row').getByRole('cell').nth(3);
    await expect(categoryCell).toHaveText(/^(N\/A|Select)/);
  }
});

/**
 * The "Category" filter's own option is named "Split?" but the value shown
 * on a matching row's Category cell is just "Split", no question mark —
 * confirmed live, a real naming inconsistency in the app. Normalize just
 * this one known case for comparison; anything else that doesn't match the
 * selected category (a genuinely different value) must still fail.
 */
function expectedCategoryCellText(category: string): string {
  return category === 'Split?' ? 'Split' : category;
}

// ── 7. Category ──────────────────────────────────────────────────────────────
test('Category filter — every listed transaction matches the selected category', async ({ page }) => {
  const categories = (await readDropdownOptions(page, 'Category')).filter((o) => o !== 'All Categories');
  test.skip(categories.length === 0, 'No categories in use on this account yet');

  for (const category of categories) {
    const found = await selectFilterOption(page, 'Category', category, { optional: true });
    if (!found) continue; // taxonomy changed since we read the list — nothing to check
    const count = await waitForFilterToSettle(page);
    const rows = transactionRows(page);
    // No transactions for this category is fine; any that ARE shown must match it.
    for (let i = 0; i < count; i++) {
      const categoryCell = rows.nth(i).getByRole('row').getByRole('cell').nth(3);
      await expect(categoryCell).toHaveText(expectedCategoryCellText(category));
    }
  }
});

// ── 8. Search ────────────────────────────────────────────────────────────────
test('Search — searching by the first row\'s Merchant name finds at least one match', async ({ page }) => {
  // Unlike every other test here, this is the first thing to read the table
  // — none of them precede it with a filter change of their own, so nothing
  // has forced a settle-wait yet. Reading .count() directly right after
  // beforeEach catches the page still on its initial skeleton (confirmed
  // live: 0 rows, but the whole page — balances included — was still
  // shimmering placeholders, not genuinely empty).
  const totalCount = await waitForFilterToSettle(page);
  test.skip(totalCount === 0, 'No transactions on this account yet');

  const rows = transactionRows(page);
  const merchant = (await rows.first().getByRole('row').getByRole('cell').first().innerText()).trim();

  const searchBox = page.getByPlaceholder('Search').locator('visible=true').first();
  await searchBox.fill(merchant);

  const matchCount = await waitForFilterToSettle(page);
  // Unlike every other filter test in this file, 0 matches + the empty-state
  // message is NOT an acceptable outcome here — we searched for text copied
  // straight off a row that's already on the page, so failing to find it
  // again is a real bug in Search, not a legitimately-empty result.
  expect(matchCount).toBeGreaterThan(0);
});
