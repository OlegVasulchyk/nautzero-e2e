import { type Page } from '@playwright/test';

/** Read the "External Account: €X,XXX.XX" balance shown on the Manual Ledger page. */
export async function getExternalAccountBalance(page: Page): Promise<number> {
  const text = await page.getByText(/External Account:\s*€[\d,]+\.\d{2}/).innerText();
  const match = text.match(/€([\d,]+\.\d{2})/);
  if (!match) throw new Error(`Could not parse External Account balance from: "${text}"`);
  return parseFloat(match[1].replace(/,/g, ''));
}

/**
 * Read a "<Label>:" metric from the Cash Account Balances widget, where the
 * label and its "€X,XXX.XX" value sit in separate elements (not one text node).
 * Climbs from the label to the nearest ancestor containing the amount.
 */
async function getBalanceByLabel(page: Page, label: string): Promise<number> {
  return await page.evaluate((labelText) => {
    const labelEl = [...document.querySelectorAll('p,span,div')].find(
      (e) => e.textContent?.trim() === `${labelText}:`
    );
    if (!labelEl) return 0;
    let c: Element | null = labelEl.closest('div');
    for (let i = 0; i < 6 && c; i++) {
      const m = [...c.querySelectorAll('*')]
        .map((e) => e.textContent?.trim() ?? '')
        .find((t) => /^€[\d,]+\.\d{2}$/.test(t));
      if (m) return parseFloat(m.replace(/[€,]/g, ''));
      c = c.parentElement;
    }
    return 0;
  }, label);
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
 * Read a department's balance card value (e.g. "€1,548.57") by its name, from
 * the "Department balances" region on the Manual Ledger page. Safe to read
 * even while a drawer/dialog is open on top of it.
 */
export async function getDepartmentBalance(page: Page, departmentName: string): Promise<number> {
  const card = page.getByRole('button', { name: `Open manual entry for ${departmentName}` });
  const text = await card.innerText();
  const match = text.match(/€([\d,]+\.\d{2})/);
  if (!match) throw new Error(`Could not parse balance for department "${departmentName}" from: "${text}"`);
  return parseFloat(match[1].replace(/,/g, ''));
}
