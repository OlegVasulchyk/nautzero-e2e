import { expect, type Page, type Locator } from '@playwright/test';
import { confirmDialog, pickRandomListboxOption } from '../helpers/ui.helper';
import { SHIPPING, type CardholderData } from '../fixtures/test-data';

export type CardState = 'active' | 'frozen';

/**
 * Page Object for /cardholders: the cardholder list (expand/collapse, search),
 * card actions on an expanded row (Freeze/Unfreeze/Replace/Cancel/Edit), and
 * the "Add a Cardholder" drawer shared by the create and delete flows.
 */
export class CardholdersPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/cardholders');
    await expect(this.page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();
  }

  /** Wait for the cardholder rows to finish loading (skeleton → real rows). */
  async waitForListLoaded(): Promise<void> {
    await this.page.getByRole('button', { name: /Expand details for/ }).first()
      .waitFor({ state: 'visible', timeout: 20_000 });
  }

  async search(text: string): Promise<void> {
    await this.page.getByPlaceholder('Search').fill(text);
  }

  expandButtonFor(name: string | RegExp): Locator {
    const pattern = typeof name === 'string' ? new RegExp(`Expand details for ${name}`) : name;
    return this.page.getByRole('button', { name: pattern });
  }

  /** Whether the currently expanded row's leading icon is a Physical card (vs Virtual). */
  async expandedRowIsPhysical(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const collapse = document.querySelector('button[aria-label^="Collapse details for"]');
      const row = collapse?.closest('tr') ?? collapse?.closest('[role="row"]');
      const img = row?.querySelector('td img, [role="cell"] img') as HTMLImageElement | null;
      const src = decodeURIComponent(img?.getAttribute('src') ?? '');
      // Physical card icon renders at 31×25; the virtual (cloud) icon renders at 30×22
      return /width='31'/.test(src) && /height='25'/.test(src);
    });
  }

  /**
   * Expand the first cardholder that has an ACTIVE or FROZEN (i.e. actionable)
   * card and leave its row open, returning which state it is in. Cancelled
   * cards render a disabled "Freeze unavailable for this card" button, so we
   * look for an enabled exact-"Freeze"/"Unfreeze" action instead.
   */
  async expandActiveCardholder(
    opts: { requireReplace?: boolean; requirePhysical?: boolean } = {}
  ): Promise<CardState> {
    await this.open();
    await this.waitForListLoaded();

    const freeze = this.page.getByRole('button', { name: 'Freeze', exact: true }).first();
    const unfreeze = this.page.getByRole('button', { name: 'Unfreeze', exact: true }).first();

    const total = await this.page.getByRole('button', { name: /Expand details for/ }).count();
    for (let i = 0; i < total; i++) {
      // All rows collapsed at the top of each iteration → indices are stable
      await this.page.getByRole('button', { name: /Expand details for/ }).nth(i).click();

      // Give the expanded content a moment to render before counting buttons —
      // an immediate count() of 0 used to silently skip suitable rows.
      await freeze.or(unfreeze).first().waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});

      // A card is actionable only when Freeze (active) or Unfreeze (frozen) is
      // present AND enabled — cancelled/deleted cards render them disabled.
      const freezeActive = (await freeze.count()) > 0 && (await freeze.isEnabled());
      const unfreezeActive = !freezeActive && (await unfreeze.count()) > 0 && (await unfreeze.isEnabled());
      let ok = freezeActive || unfreezeActive;

      // Replace is blocked for 14 days after a replacement — require it enabled when asked
      if (ok && opts.requireReplace) {
        const replace = this.page.getByRole('button', { name: 'Replace', exact: true }).first();
        ok = (await replace.count()) > 0 && (await replace.isEnabled());
      }

      // Only physical cards show the shipping-address form on replace (virtual
      // replaces instantly), so the replace test must land on a physical card.
      if (ok && opts.requirePhysical) {
        ok = await this.expandedRowIsPhysical();
      }

      if (ok) {
        return freezeActive ? 'active' : 'frozen'; // found — leave this row expanded
      }

      // Not suitable → collapse and try the next row
      await this.page.getByRole('button', { name: /Collapse details for/ }).click();
    }
    throw new Error('No cardholder with a suitable active card found on this page');
  }

  /** If the expanded row's card is frozen, unfreeze it so we start from Active. */
  async ensureExpandedCardActive(state: CardState): Promise<void> {
    if (state !== 'frozen') return;
    await this.page.getByRole('button', { name: 'Unfreeze', exact: true }).first().click();
    await confirmDialog(this.page, 'Unfreeze Card');
    await expect(this.page.getByRole('button', { name: 'Freeze', exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }

  /** Expand the first cardholder with an active card and open its Edit form. */
  async openFirstCardholderEdit(): Promise<void> {
    const state = await this.expandActiveCardholder();
    await this.ensureExpandedCardActive(state);
    await this.page.getByRole('button', { name: 'Edit' }).first().click();
  }

  /**
   * Read the account "Remaining Balance" value (in dollars). The metric value
   * can be visually truncated on narrow viewports, so this climbs to the
   * metric column and pulls the full "$x,xxx.xx" string from the DOM.
   * Throws when the metric isn't rendered (poll via expectRemainingBalance).
   */
  async getRemainingBalance(): Promise<number> {
    const value = await this.page.evaluate(() => {
      const label = [...document.querySelectorAll('p,span,div')].find(
        (e) => e.textContent?.trim() === 'Remaining Balance:'
      );
      if (!label) return null;
      let c: Element | null = label.closest('div');
      for (let i = 0; i < 6 && c; i++) {
        const m = [...c.querySelectorAll('*')]
          .map((e) => e.textContent?.trim() ?? '')
          .find((t) => /^\$[\d,]+\.\d{2}$/.test(t));
        if (m) return parseFloat(m.replace(/[$,]/g, ''));
        c = c.parentElement;
      }
      return null;
    });
    if (value === null) throw new Error('Could not read the "Remaining Balance:" metric from the page');
    return value;
  }

  /** Poll until the Remaining Balance metric has rendered, then return it. */
  async readRemainingBalance(): Promise<number> {
    await expect
      .poll(async () => {
        try {
          return await this.getRemainingBalance();
        } catch {
          return NaN;
        }
      }, { timeout: 10_000, message: 'Remaining Balance metric should render' })
      .not.toBeNaN();
    return this.getRemainingBalance();
  }

  // ── Edit form inputs (formatted/masked — thousands separators; :visible to
  //    skip hidden duplicates from collapsed rows) ─────────────────────────────

  get balanceInput(): Locator {
    return this.page.locator('input[aria-label="Cardholder Balance"]:visible');
  }

  get limitInput(): Locator {
    return this.page.locator('input[aria-label="Monthly Card Limit:"]:visible');
  }

  // ── "Add a Cardholder" drawer (create & delete flows) ───────────────────────

  async openAddCardholderDrawer(kind: 'Virtual' | 'Physical'): Promise<void> {
    await this.page.getByRole('button', { name: 'Add a Cardholder' }).click();
    await expect(this.page.getByRole('dialog', { name: 'Order A Cardholder' })).toBeVisible();
    await this.page.getByRole('button', { name: kind }).click();
    await expect(this.page.getByRole('heading', { name: `${kind} Card` })).toBeVisible();
  }

  /** Personal-details step (Virtual & Physical step 1). Returns the picked department. */
  async fillPersonalDetails(data: CardholderData): Promise<string> {
    await this.page.getByLabel('First Name').fill(data.firstName);
    await this.page.getByLabel('Last Name').fill(data.lastName);
    await this.page.locator('input[type="tel"]').fill(data.phone);
    await this.page.getByLabel('Email Address').fill(data.email);

    // Department dropdown — open it, then pick a random option from whatever list appears
    await this.page.getByRole('dialog').getByRole('button', { name: 'Department' }).click();
    const department = await pickRandomListboxOption(this.page);

    // Date of Birth — 3 separate custom dropdowns
    await this.page.getByRole('button', { name: 'Day' }).click();
    await this.page.getByRole('option', { name: data.dobDay, exact: true }).click();
    await this.page.getByRole('button', { name: 'Month' }).click();
    await this.page.getByRole('option', { name: data.dobMonth }).click();
    await this.page.getByRole('button', { name: 'Year' }).click();
    await this.page.getByRole('option', { name: data.dobYear }).click();

    await this.page.getByLabel('Set Monthly Card Limit').fill(data.monthlyLimit);
    return department;
  }

  /** Shipping-address step (Physical step 2; also used by card replacement). */
  async fillShippingAddress(shipping: typeof SHIPPING = SHIPPING): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Street Address', exact: true }).fill(shipping.street);
    await this.page.getByLabel('City / Town').fill(shipping.city);

    // State / Region searchable dropdown
    await this.page.getByRole('button', { name: 'State / Region' }).click();
    await this.page.getByRole('option', { name: shipping.region, exact: true }).click();

    await this.page.getByLabel('Postcode').fill(shipping.postcode);
  }
}
