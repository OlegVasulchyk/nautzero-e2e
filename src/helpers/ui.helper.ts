import { expect, type Page, type Locator } from '@playwright/test';
import { randInt } from '../fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives for NautZero.
//
// These encode the app-specific interaction patterns that used to be
// copy-pasted into every spec (see CLAUDE.md "Conventions & hard-won lessons").
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a custom listbox by its associated label, pick the option at `index`,
 * and return its text. NautZero dropdowns are custom listboxes exposing
 * `role="option"` (not native <select>).
 */
export async function selectOptionByIndex(page: Page, fieldLabel: string, index: number): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  const option = page.getByRole('listbox').getByRole('option').nth(index);
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

/** Open a dropdown by its associated label, pick the first option, and return its text. */
export async function selectFirstOption(page: Page, fieldLabel: string): Promise<string> {
  return selectOptionByIndex(page, fieldLabel, 0);
}

/** Open a dropdown by its label and pick the option with the given exact name. */
export async function selectNamedOption(page: Page, fieldLabel: string, optionName: string): Promise<void> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: optionName, exact: true }).click();
}

/**
 * Pick a RANDOM option from the currently OPEN listbox, returning its text.
 * Used for Department / Boat Type and similar lists whose contents vary per
 * account — never hardcode those names. Open the dropdown first (by label,
 * button, or dialog-scoped trigger — it differs per form).
 */
export async function pickRandomListboxOption(page: Page): Promise<string> {
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toBeVisible();
  const count = await options.count();
  const option = options.nth(randInt(0, count - 1));
  const text = (await option.innerText()).trim();
  await option.click();
  return text;
}

/** Open a dropdown by its associated label and pick a random option. */
export async function pickRandomOption(page: Page, fieldLabel: string): Promise<string> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  return pickRandomListboxOption(page);
}

/** Open a dropdown by its trigger button's name and pick a random option. */
export async function pickRandomOptionFromButton(page: Page, buttonName: string): Promise<string> {
  await page.getByRole('button', { name: buttonName }).click();
  return pickRandomListboxOption(page);
}

/**
 * Dismiss an open reveal modal (PIN / card details): the close button when it
 * exists, Escape otherwise.
 */
export async function closeRevealModal(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: /close/i }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press('Escape');
  }
}

/**
 * Fill a formatted (masked) amount/phone input. Typing into these drops the
 * decimal point, and `fill()` alone doesn't always stick — so: click,
 * clear, type character by character, then blur to commit the value.
 */
export async function fillMaskedInput(input: Locator, value: string): Promise<void> {
  await input.click();
  await input.fill('');
  await input.pressSequentially(value);
  await input.blur();
}

/**
 * Confirm (or dismiss) a modal identified by its heading. Several NautZero
 * modals/drawers don't expose role="dialog", so the heading + a page-level
 * button is the reliable pattern.
 */
export async function confirmDialog(page: Page, heading: string | RegExp, button = 'Yes'): Promise<void> {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await page.getByRole('button', { name: button, exact: true }).click();
}

/**
 * Wait for a success toast/confirmation. Case-sensitive by default so random
 * prose containing "successfully" isn't silently accepted unless asked for.
 */
export async function expectSuccessToast(page: Page, pattern: string | RegExp = /SUCCESS/): Promise<void> {
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Enter the 6-digit OTP into the "Digit N of 6" inputs and submit.
 * The login form submits with "Continue"; the card-details/PIN modal with "Submit".
 */
export async function enterOtp(page: Page, otp: string, submitButtonName: 'Continue' | 'Submit' = 'Continue'): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(otp[i]);
  }
  await page.getByRole('button', { name: submitButtonName }).click();
}

/**
 * The logged-in user's display name, from the header banner.
 * Positional on purpose: the banner renders [Help, date, name] as <p> elements
 * with no distinguishing roles/labels.
 */
export async function getLoggedInUserName(page: Page): Promise<string> {
  return (await page.getByRole('banner').locator('p').nth(1).innerText()).trim();
}
