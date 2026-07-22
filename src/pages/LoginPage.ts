import { type Page, type Locator } from '@playwright/test';

/**
 * Page Object for NautZero login flow.
 *
 * Covers three screens:
 *  1. /user/login          — phone + password form
 *  2. /user/login (2FA)    — 6-digit OTP form
 *  3. /user/policy-acceptance — Terms & Conditions (shown on first login)
 */
export class LoginPage {
  readonly page: Page;

  // ── Login form ──────────────────────────────────────────────────────────
  readonly phoneInput: Locator;
  readonly passwordInput: Locator;
  readonly countryButton: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordButton: Locator;

  // ── 2FA form ────────────────────────────────────────────────────────────
  readonly otpHeading: Locator;
  readonly otpDigits: Locator[];
  readonly otpContinueButton: Locator;

  // ── Policy acceptance ───────────────────────────────────────────────────
  readonly termsCheckbox: Locator;
  readonly policyContinueButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Login form
    this.phoneInput          = page.locator('input[type="tel"]');
    this.passwordInput       = page.locator('input[type="password"]');
    this.countryButton       = page.locator('button[aria-label^="Country code"]');
    this.loginButton         = page.locator('button[type="submit"]').filter({ hasText: 'Login' });
    this.forgotPasswordButton = page.locator('button', { hasText: 'Forgotten your username or password?' });

    // 2FA form — 6 individual digit inputs
    this.otpHeading       = page.getByRole('heading', { name: 'Enter Your Security Code' });
    this.otpDigits        = Array.from({ length: 6 }, (_, i) =>
      page.getByLabel(`Digit ${i + 1} of 6`)
    );
    this.otpContinueButton = page.locator('button[type="submit"]').filter({ hasText: 'Continue' });

    // Policy acceptance
    this.termsCheckbox        = page.locator('input[type="checkbox"]');
    this.policyContinueButton = page.locator('button[type="submit"]').filter({ hasText: 'Continue' });
  }

  async goto() {
    await this.page.goto('/user/login');
  }

  /**
   * Select a country from the phone number dropdown.
   * The dropdown renders a simple list of buttons with the country name as text.
   * @param countryName Full country name as shown in the dropdown, e.g. 'United States', 'United Kingdom'
   */
  async selectCountry(countryName: string) {
    // Open the dropdown
    await this.countryButton.click();
    // Wait for dropdown options to appear and click the matching country
    await this.page.locator('button', { hasText: countryName }).first().click();
  }

  /**
   * Fill in the phone number field.
   * For GB numbers the +44 prefix is pre-selected; just pass the local number.
   * For other countries, call selectCountry() first.
   */
  async fillPhone(phone: string) {
    await this.phoneInput.fill(phone);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  /**
   * Enter a 6-digit OTP one character at a time.
   * The form uses individual single-character inputs that auto-advance.
   */
  async fillOtp(otp: string) {
    await this.otpHeading.waitFor({ state: 'visible' });
    for (let i = 0; i < 6; i++) {
      await this.otpDigits[i].fill(otp[i]);
    }
  }

  async submitOtp() {
    await this.otpContinueButton.click();
  }

  /**
   * Accept Terms & Conditions on the policy-acceptance page.
   * This page appears only on the first login for an account.
   */
  async acceptPolicyIfPresent() {
    if (this.page.url().includes('policy-acceptance')) {
      await this.termsCheckbox.check();
      await this.policyContinueButton.click();
    }
  }
}
