import { expect, type Page } from '@playwright/test';
import {
  getCurrencySymbol,
  getExternalAccountBalance,
  getCashAccountBalances,
  getDepartmentBalance,
  getFirstDepartmentName,
} from '../helpers/manual-ledger.helper';
import { getLoggedInUserName } from '../helpers/ui.helper';

/** How long to poll balances after submit+reload — the backend settles asynchronously. */
const BALANCE_TIMEOUT = 15_000;

/**
 * Format an amount the way NautZero displays it, e.g. "€2,134.57".
 * `currency` comes from ManualLedgerPage.currencySymbol() — it depends on the
 * logged-in account (EUR/USD/GBP), so it's read dynamically, never hardcoded.
 */
export function formatAmount(currency: string, amount: string | number): string {
  return `${currency}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

/**
 * Page Object for the Manual Ledger page (/accounts): the External Account and
 * Cash Account Balances widgets, Department balance cards, and the two wizard
 * entry points ("Add Manual Entry" / "Add Cash Entry").
 */
export class ManualLedgerPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/accounts');
    await expect(this.page.getByRole('heading', { name: 'External Account Manual Ledger' })).toBeVisible();
  }

  async currencySymbol(): Promise<string> {
    return getCurrencySymbol(this.page);
  }

  async loggedInUserName(): Promise<string> {
    return getLoggedInUserName(this.page);
  }

  // ── Wizard entry points ───────────────────────────────────────────────────

  /** External Account flows (Credit / Paid Invoice). */
  async addManualEntry(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Manual Entry' }).click();
  }

  /** Cash Account flows (Transaction / Transfer). */
  async addCashEntry(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Cash Entry' }).click();
  }

  /**
   * Click a sub-account's own Department balance card — jumps straight to
   * "Debit or Credit" (a card click is always a cash transfer scoped to that
   * sub-account, so "Transaction or Transfer" is skipped).
   */
  async openDepartmentCard(departmentName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Open manual entry for ${departmentName}` }).click();
  }

  // ── Balance reads ─────────────────────────────────────────────────────────

  async externalBalance(): Promise<number> {
    return getExternalAccountBalance(this.page);
  }

  async cashBalances(): Promise<{ total: number; allocated: number; remaining: number }> {
    return getCashAccountBalances(this.page);
  }

  async departmentBalance(departmentName: string): Promise<number> {
    return getDepartmentBalance(this.page, departmentName);
  }

  async firstDepartmentName(): Promise<string> {
    return getFirstDepartmentName(this.page);
  }

  // ── Balance expectations (polled — a single read after reload races the backend) ──

  private async pollBalance(read: () => Promise<number>, expected: number, what: string): Promise<void> {
    await expect
      .poll(async () => {
        try {
          return await read();
        } catch {
          return NaN; // not rendered yet — keep polling
        }
      }, { timeout: BALANCE_TIMEOUT, message: `${what} should settle at ${expected}` })
      .toBeCloseTo(expected, 2);
  }

  async expectExternalBalance(expected: number): Promise<void> {
    await this.pollBalance(() => this.externalBalance(), expected, 'External Account balance');
  }

  async expectDepartmentBalance(departmentName: string, expected: number): Promise<void> {
    await this.pollBalance(() => this.departmentBalance(departmentName), expected, `"${departmentName}" department balance`);
  }

  async expectCashBalances(expected: { total: number; remaining: number }): Promise<void> {
    await this.pollBalance(async () => (await this.cashBalances()).total, expected.total, 'Total Balance');
    await this.pollBalance(async () => (await this.cashBalances()).remaining, expected.remaining, 'Remaining Balance');
  }
}
