import { type Page, type Locator, expect } from '@playwright/test';

/** Currency symbols this suite understands — which one is active depends on the logged-in account. */
const CURRENCY_SYMBOLS = ['€', '$', '£'];
const CURRENCY_CLASS = `[${CURRENCY_SYMBOLS.join('')}]`;
const AMOUNT_RE = new RegExp(`${CURRENCY_CLASS}([\\d,]+\\.\\d{2})`);

/**
 * Detect which currency this account's balances are shown in, by reading the
 * symbol off the "External Account: <symbol>X,XXX.XX" balance. Every
 * manual-ledger page shows this widget, so it's a reliable place to read it
 * from regardless of which flow (External Account or Cash Account) is under test.
 */
export async function getCurrencySymbol(page: Page): Promise<string> {
  const text = await page.getByText(new RegExp(`External Account:\\s*${CURRENCY_CLASS}[\\d,]+\\.\\d{2}`)).innerText();
  const match = text.match(new RegExp(CURRENCY_CLASS));
  if (!match) throw new Error(`Could not detect currency symbol from: "${text}"`);
  return match[0];
}

/** Read the "External Account: <symbol>X,XXX.XX" balance shown on the Manual Ledger page. */
export async function getExternalAccountBalance(page: Page): Promise<number> {
  const text = await page.getByText(new RegExp(`External Account:\\s*${CURRENCY_CLASS}[\\d,]+\\.\\d{2}`)).innerText();
  const match = text.match(AMOUNT_RE);
  if (!match) throw new Error(`Could not parse External Account balance from: "${text}"`);
  return parseFloat(match[1].replace(/,/g, ''));
}

/**
 * Read a "<Label>:" metric from the Cash Account Balances widget, where the
 * label and its "<symbol>X,XXX.XX" value sit in separate elements (not one
 * text node). Climbs from the label to the nearest ancestor containing the amount.
 *
 * Right after a `page.reload()` the widget briefly renders skeleton
 * placeholders instead of the amount, so this polls (via waitForFunction)
 * until the real value shows up instead of reading immediately — reading
 * too early silently produced 0 and made unrelated assertions fail.
 */
async function getBalanceByLabel(page: Page, label: string, timeout = 15_000): Promise<number> {
  const handle = await page.waitForFunction(({ labelText, symbols }) => {
    const labelEl = [...document.querySelectorAll('p,span,div')].find(
      (e) => e.textContent?.trim() === `${labelText}:`
    );
    if (!labelEl) return null;
    const amountPattern = new RegExp(`^[${symbols.join('')}][\\d,]+\\.\\d{2}$`);
    let c: Element | null = labelEl.closest('div');
    for (let i = 0; i < 6 && c; i++) {
      const m = [...c.querySelectorAll('*')]
        .map((e) => e.textContent?.trim() ?? '')
        .find((t) => amountPattern.test(t));
      if (m) return m;
      c = c.parentElement;
    }
    return null;
  }, { labelText: label, symbols: CURRENCY_SYMBOLS }, { timeout }).catch(() => null);

  if (!handle) {
    throw new Error(`Timed out waiting for "${label}" balance to finish loading (still showing skeleton after ${timeout}ms)`);
  }
  const text = await handle.jsonValue() as string;
  return parseFloat(text.replace(/[^\d.]/g, ''));
}

/** Read Total, Allocated, and Remaining Balance from the Cash Account Balances widget. */
export async function getCashAccountBalances(page: Page): Promise<{ total: number; allocated: number; remaining: number }> {
  return {
    total: await getBalanceByLabel(page, 'Total Balance'),
    allocated: await getBalanceByLabel(page, 'Allocated Balance'),
    remaining: await getBalanceByLabel(page, 'Remaining Balance'),
  };
}

/**
 * Read a department's balance card value (e.g. "<symbol>1,548.57") by its
 * name, from the "Department balances" region on the Manual Ledger page.
 * Safe to read even while a drawer/dialog is open on top of it.
 */
export async function getDepartmentBalance(page: Page, departmentName: string): Promise<number> {
  const card = page.getByRole('button', { name: `Open manual entry for ${departmentName}` });
  const text = await card.innerText();
  const match = text.match(AMOUNT_RE);
  if (!match) throw new Error(`Could not parse balance for department "${departmentName}" from: "${text}"`);
  return parseFloat(match[1].replace(/,/g, ''));
}

/**
 * Read a department's balance after `page.reload()`, waiting for it to move
 * off `staleValue` (the pre-transaction reading) first. Unlike the Cash
 * Account Balances widget, this card doesn't render a skeleton while
 * refetching — it keeps showing the old cached amount, in a validly
 * formatted way, until the new one arrives. Reading it immediately after a
 * reload can therefore return a perfectly well-formed but stale number.
 */
export async function waitForDepartmentBalanceChange(
  page: Page,
  departmentName: string,
  staleValue: number,
  timeout = 15_000
): Promise<number> {
  await expect
    .poll(() => getDepartmentBalance(page, departmentName), {
      timeout,
      message: `"${departmentName}" balance is still showing the pre-transaction value (${staleValue}) after ${timeout}ms`,
    })
    .not.toBe(staleValue);
  return getDepartmentBalance(page, departmentName);
}

/**
 * Read the name of the first Department balance card ("Open manual entry
 * for <name>") on the Manual Ledger page, without clicking it. Callers can
 * read that department's balance first (via getDepartmentBalance), then
 * click the same card — `page.getByRole('button', { name: \`Open manual
 * entry for ${name}\` })` — to open the cash-entry wizard directly at
 * "Debit or Credit" (skipping "Transaction or Transfer" — a card click is
 * always a cash transfer scoped to that specific sub-account).
 */
export async function getFirstDepartmentName(page: Page): Promise<string> {
  const card = page.getByRole('button', { name: /^Open manual entry for / }).first();
  const label = (await card.getAttribute('aria-label')) ?? '';
  const departmentName = label.replace(/^Open manual entry for /, '').trim();
  if (!departmentName) throw new Error(`Could not parse department name from aria-label: "${label}"`);
  return departmentName;
}

/**
 * "Charter or Boat" / "Charter or Operational" screen — the second choice's
 * label depends on the account type (yacht vs plane), so it can't be
 * hardcoded. Reads whichever variant is actually shown (assumes the heading
 * is already visible) and clicks the requested choice, returning the label
 * used for the non-charter option (e.g. "Boat" or "Operational") so callers
 * can use it later instead of a hardcoded guess.
 */
export async function selectCharterOrAsset(page: Page, choice: 'charter' | 'asset'): Promise<string> {
  const heading = page.getByRole('heading', { name: /^Charter or .+$/ });
  const headingText = (await heading.innerText()).trim();
  const assetLabel = headingText.replace(/^Charter or /, '');
  const buttonName = choice === 'charter' ? 'Charter' : assetLabel;
  await page.getByRole('button', { name: buttonName, exact: true }).first().click();
  return assetLabel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Transactions table — filter row, row expansion, settle-waits.
// Shared by transactions-filters.spec.ts and transactions-pagination.spec.ts
// (and any future spec touching the same table) so this plumbing lives in
// exactly one place instead of being copy-pasted per file.
// ─────────────────────────────────────────────────────────────────────────────

/** Shown by the Manual Transactions table when a filter/search matches nothing. */
export const NO_RESULTS_TEXT = 'Your filters returned no results.';

/**
 * Fixed left-to-right DOM order of the 7 filter dropdowns above the Manual
 * Transactions table. "Dates" is deliberately excluded — it's
 * aria-haspopup="dialog" (a calendar), not "listbox" like these seven.
 */
const DROPDOWN_INDEX = {
  'All Transactions': 0,
  'Cash Transactions': 1,
  'Cash Transfer': 2,
  'Bank Transactions': 3,
  'Charter Transactions': 4,
  Filter: 5,
  Category: 6,
} as const;
export type DropdownLabel = keyof typeof DROPDOWN_INDEX;

/**
 * Positional lookup — these buttons have no aria-label/data-testid, and
 * their accessible name IS whatever option is currently selected (confirmed
 * live: picking "No Charter Transactions" renames the "All Transactions"
 * button itself to "No Charter Transactions"). Looking a dropdown up by its
 * *original* label therefore stops working the moment it's no longer on the
 * default option. All 7 share aria-haspopup="listbox" and sit in a fixed DOM
 * order, so they're looked up by position instead — stable regardless of
 * what they currently display.
 */
export function filterDropdown(page: Page, label: DropdownLabel): Locator {
  return page.locator('button[aria-haspopup="listbox"]').locator('visible=true').nth(DROPDOWN_INDEX[label]);
}

/**
 * Open a filter dropdown by its button label and pick the option by name.
 *
 * Strict by default — throws if the option never appears, same as a plain
 * `.click()` would. Pass `optional: true` ONLY where the caller actually
 * checks the boolean return and acts on it (e.g. a Category loop, whose list
 * can change between reading it and selecting from it on a shared staging
 * account) — swallowing the failure anywhere else would silently leave the
 * filter unchanged and let a test verify stale/wrong data without failing.
 */
export async function selectFilterOption(
  page: Page,
  dropdownLabel: DropdownLabel,
  optionName: string,
  opts: { optional?: boolean; timeout?: number } = {}
): Promise<boolean> {
  const { optional = false, timeout = 8_000 } = opts;
  await filterDropdown(page, dropdownLabel).click();
  if (!optional) {
    await page.getByRole('option', { name: optionName, exact: true }).click({ timeout });
    return true;
  }
  try {
    await page.getByRole('option', { name: optionName, exact: true }).click({ timeout });
    return true;
  } catch {
    await filterDropdown(page, dropdownLabel).click(); // close the dropdown before giving up
    return false;
  }
}

/**
 * Read every option label in a dropdown without leaving it selected.
 * Escape does NOT close this listbox (confirmed live) — closing it means
 * clicking the trigger again, the same toggle that opened it.
 *
 * The static placeholder ("All Charter Transactions") renders instantly,
 * but the real entries load in after a separate async fetch — confirmed
 * live with actual timestamps: the list read as just the placeholder at
 * both t=3486ms AND t=4001ms (515ms apart, genuinely unchanged), then
 * jumped to 4 real entries at t=4516ms. So two consecutive matching reads
 * is NOT proof of "loaded" — it can sit stably wrong for over a second
 * before the real data lands. Require several consecutive matches spanning
 * a longer window before trusting it, bounded overall so a genuinely-empty
 * list (no charters/sub-accounts at all) still resolves without hanging.
 */
export async function readDropdownOptions(page: Page, dropdownLabel: DropdownLabel, timeout = 20_000): Promise<string[]> {
  const trigger = filterDropdown(page, dropdownLabel);
  await trigger.click();
  await page.getByRole('option').first().waitFor({ state: 'visible' });

  let previousKey: string | null = null;
  let matchStreak = 0;
  let stable: string[] = [];
  await expect(async () => {
    const current = await page.getByRole('option').allInnerTexts();
    const key = JSON.stringify(current);
    matchStreak = key === previousKey ? matchStreak + 1 : 0;
    previousKey = key;
    stable = current;
    expect(matchStreak).toBeGreaterThanOrEqual(3); // 3 consecutive matches ≈ 1.8s+ of no change
  }).toPass({ timeout, intervals: [600] });

  await trigger.click(); // toggle closed
  return stable;
}

/** Every row currently shown by the Manual Transactions table. */
export function transactionRows(page: Page): Locator {
  return page.getByRole('article');
}

/**
 * Wait until the table has settled after a filter change — either rows are
 * present or the empty-state message is showing — then return the row
 * count. Never trust a bare .count() read right after selecting a filter:
 * the table clears to empty while a search/filter is in flight rather than
 * showing stale rows, so a too-early read can catch a transient 0 that
 * isn't the real (empty-state) answer yet. 15s, not 10s — confirmed live
 * the skeleton can still be showing well past 10s, matching the same
 * loading lag seen elsewhere in this app.
 */
export async function waitForFilterToSettle(page: Page, timeout = 15_000): Promise<number> {
  await expect(async () => {
    const rowCount = await transactionRows(page).count();
    const emptyVisible = await page.getByText(NO_RESULTS_TEXT, { exact: false }).isVisible();
    expect(rowCount > 0 || emptyVisible).toBe(true);
  }).toPass({ timeout });
  return transactionRows(page).count();
}

/**
 * Reset filters back to the default view via a page reload instead of
 * clicking through the UI — sidesteps every dropdown quirk above entirely
 * (positional lookup, toggle-close, renamed trigger) for what's just
 * cleanup, not something under test. Assumes the Manual Ledger page is
 * already the current page.
 */
export async function resetFilters(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Manual Transactions' })).toBeVisible();
  await waitForFilterToSettle(page);
}

/**
 * Expand a row's details if not already expanded. The toggle button renames
 * itself to "Collapse transaction details" once open, and a row can stay
 * expanded across a filter change (the same DOM node persists, it isn't
 * remounted) — clicking by the "Expand..." name unconditionally would then
 * hang forever waiting for a name that's no longer there.
 *
 * The click flips the toggle instantly, but the panel's own content
 * ("Description:", "Charter Name:", "User:") can take a while to actually
 * render — this app's widgets have shown real loading lag elsewhere in this
 * suite (up to ~15s). Wait for that content explicitly and boundedly here,
 * rather than leaving each caller's own assertion to (maybe) time out first —
 * it resolves the moment the panel is ready, so a fast render doesn't cost
 * the full timeout either way.
 */
export async function ensureExpanded(article: Locator): Promise<void> {
  const expandBtn = article.getByRole('button', { name: 'Expand transaction details' });
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
  }
  await article.getByText('Description:').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Expand (if needed) and return the first row of a locator set. */
export async function expandFirst(rows: Locator): Promise<Locator> {
  const article = rows.first();
  await ensureExpanded(article);
  return article;
}

/**
 * Read a labeled field's value from an expanded row's panel (e.g. "Account:"
 * → "Captain"). Label and value are adjacent siblings in the DOM (confirmed
 * live), so the value is just the next element after the label.
 *
 * The label renders instantly but the value can still be empty for a beat
 * after that (confirmed live: caught "" right after expanding, same
 * label-now/value-later lag already hit on the dropdown options above) — so
 * poll for non-empty text instead of reading once. Still empty when the
 * bounded timeout runs out is a real failure, not "field doesn't apply
 * here" — the caller decides which fields are expected to be present.
 */
export async function getFieldValue(article: Locator, label: string, timeout = 15_000): Promise<string> {
  const value = article.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
  let text = '';
  await expect(async () => {
    text = (await value.innerText()).trim();
    expect(text).not.toBe('');
  }).toPass({ timeout });
  return text;
}
