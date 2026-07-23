import { test, expect } from '@playwright/test';
import { LoginPage } from '../../src/pages/LoginPage';
import { login } from '../../src/helpers/auth.helper';
import { USERS, STAGING_OTP } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// TC-001 · TC-002 · TC-003  Login — all three roles
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login', () => {

  // ── TC-001: Cardholder ────────────────────────────────────────────────────
  test('TC-001 | Login as Cardholder', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Step 1: Fill credentials
    await loginPage.fillPhone(USERS.cardholder.phone);
    await loginPage.fillPassword(USERS.cardholder.password);
    await loginPage.clickLogin();

    // Step 2: 2FA screen appears
    await expect(loginPage.otpHeading).toBeVisible();
    await expect(page.locator('text=We\'ve sent a 6-digit security code')).toBeVisible();

    // Step 3: Enter OTP
    await loginPage.fillOtp(STAGING_OTP);
    await loginPage.submitOtp();

    // Step 4: Handle policy acceptance (first login only)
    await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });
    await loginPage.acceptPolicyIfPresent();

    // Step 5: Assert Dashboard loaded
    await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Assert Cardholder-specific nav is visible (no Finance/Cardholders/Banking)
    await expect(page.locator('a[title="Finance"]')).not.toBeVisible();
    await expect(page.locator('a[title="Cardholders"]')).not.toBeVisible();
  });

  // ── TC-002: Yacht Admin ───────────────────────────────────────────────────
  test('TC-002 | Login as Yacht Admin', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.fillPassword(USERS['yacht-admin'].password);
    await loginPage.clickLogin();

    // 2FA
    await expect(loginPage.otpHeading).toBeVisible();
    await loginPage.fillOtp(STAGING_OTP);
    await loginPage.submitOtp();

    await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });
    await loginPage.acceptPolicyIfPresent();

    await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Assert Yacht Admin nav items are visible
    await expect(page.locator('a[title="Finance"]')).toBeVisible();
    await expect(page.locator('a[title="Cardholders"]')).toBeVisible();
    await expect(page.locator('a[title="Banking"]')).toBeVisible();
    await expect(page.locator('a[title="Charters"]')).toBeVisible();
    await expect(page.locator('a[title="Manual Ledger"]')).toBeVisible();
  });

  // ── TC-003: Yacht Manager Admin ───────────────────────────────────────────
  test('TC-003 | Login as Yacht Manager Admin', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Step 1: Select United States from country dropdown
    await loginPage.selectCountry('United States');
    // Step 2: Fill in local phone number (without country code)
    await loginPage.fillPhone(USERS['yacht-manager-admin'].phone);
    await loginPage.fillPassword(USERS['yacht-manager-admin'].password);
    await loginPage.clickLogin();

    // 2FA
    await expect(loginPage.otpHeading).toBeVisible();
    await loginPage.fillOtp(STAGING_OTP);
    await loginPage.submitOtp();

    // Account selection (USD/EUR) — specific to Yacht Manager Admin
    await loginPage.selectAccountIfPresent('usd');

    await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });
    await loginPage.acceptPolicyIfPresent();

    // Yacht Manager Admin lands on /fleet after login
    await page.waitForURL((url) => url.pathname.startsWith('/fleet'), { timeout: 15_000 });
    await expect(page).toHaveURL(/\/fleet/);

    // Assert Yacht Manager Admin-specific nav
    await expect(page.locator('a[title="Fleet"]')).toBeVisible();
    await expect(page.locator('a[title="Settings"]')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Login error cases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login — negative cases', () => {

  test('Shows error on wrong password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.fillPassword('WrongPassword123!');
    await loginPage.clickLogin();

    // Should stay on login page and show an error
    await expect(page).toHaveURL(/\/user\/login/);
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
  });

  test('Shows error on wrong OTP', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.fillPassword(USERS['yacht-admin'].password);
    await loginPage.clickLogin();

    await expect(loginPage.otpHeading).toBeVisible();
    await loginPage.fillOtp('000000');
    await loginPage.submitOtp();

    // Should show error and stay on login / 2FA screen
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
  });

  test('Shows error when submitting empty form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.clickLogin();

    await expect(page).toHaveURL(/\/user\/login/);
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
  });

  test('Shows error when password is empty', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.clickLogin();

    await expect(page).toHaveURL(/\/user\/login/);
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Login — 2FA OTP resend
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login — 2FA', () => {

  test('2FA: "Didn\'t get your code?" resend button works', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.fillPassword(USERS['yacht-admin'].password);
    await loginPage.clickLogin();

    await expect(loginPage.otpHeading).toBeVisible({ timeout: 10_000 });

    // Resend button is visible and clickable
    await expect(loginPage.resendOtpButton).toBeVisible();
    await loginPage.resendOtpButton.click();

    // Should remain on 2FA screen after resend
    await expect(loginPage.otpHeading).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: reusable login used in other spec files
// Usage:  await login(page, USERS['yacht-admin']);
// ─────────────────────────────────────────────────────────────────────────────
export { login };
