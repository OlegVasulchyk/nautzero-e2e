import { type Page } from '@playwright/test';

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
const EXTERNAL_ACCOUNT_RE = new RegExp(`External Account:\\s*${CURRENCY_CLASS}[\\d,]+\\.\\d{2}`);

export async function getCurrencySymbol(page: Page): Promise<string> {
  const text = await page.getByText(EXTERNAL_ACCOUNT_RE).innerText();
  const match = text.match(new RegExp(CURRENCY_CLASS));
  if (!match) throw new Error(`Could not detect currency symbol from: "${text}"`);
  return match[0];
}

/** Read the "External Account: <symbol>X,XXX.XX" balance shown on the Manual Ledger page. */
export async function getExternalAccountBalance(page: Page): Promise<number> {
  const text = await page.getByText(EXTERNAL_ACCOUNT_RE).innerText();
  const match = text.match(AMOUNT_RE);
  if (!match) throw new Error(`Could not parse External Account balance from: "${text}"`);
  return parseFloat(match[1].replace(/,/g, ''));
}

/**
 * Read a "<Label>:" metric from the Cash Account Balances widget, where the
 * label and its "<symbol>X,XXX.XX" value sit in separate elements (not one
 * text node). Climbs from the label to the nearest ancestor containing the amount.
 */
async function getBalanceByLabel(page: Page, label: string): Promise<number> {
  const value = await page.evaluate(({ labelText, symbols }) => {
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
      if (m) return parseFloat(m.replace(/[^\d.]/g, ''));
      c = c.parentElement;
    }
    return null;
  }, { labelText: label, symbols: CURRENCY_SYMBOLS });
  // Throw instead of returning a silent 0 — a missing/not-yet-rendered widget
  // must fail the read, not fake an empty balance. Callers that poll catch this.
  if (value === null) throw new Error(`Could not find the "${label}:" balance on the page`);
  return value;
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
