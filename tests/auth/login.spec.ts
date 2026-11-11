import { test, expect } from '../../src/fixtures/test';
import { LoginPage } from '../../src/pages/LoginPage';
import { login } from '../../src/helpers/auth.helper';
import { USERS, STAGING_OTP } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// TC-001 · TC-002 · TC-003  Login — Cardholder / Yacht Admin / Yacht Manager Admin
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login', () => {

  // ── TC-001: Cardholder — the one step-by-step flow (asserts each 2FA screen);
  //    the other roles reuse the login() helper for the same steps. ────────────
  test('TC-001 | Login as Cardholder', async ({ page }) => {
    const user = USERS.cardholder;
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Step 1: Fill credentials (country from the fixture — not hardcoded GB)
    if (user.countryName && user.countryName !== 'United Kingdom') {
      await loginPage.selectCountry(user.countryName);
    }
    await loginPage.fillPhone(user.phone);
    await loginPage.fillPassword(user.password);
    await loginPage.clickLogin();

    // Step 2: 2FA screen appears
    await expect(loginPage.otpHeading).toBeVisible();
    await expect(page.getByText("We've sent a 6-digit security code")).toBeVisible();

    // Step 3: Enter OTP
    await loginPage.fillOtp(STAGING_OTP);
    await loginPage.submitOtp();

    // Step 4: Handle policy acceptance (first login only)
    await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });
    await loginPage.acceptPolicyIfPresent();

    // Step 5: Assert Dashboard loaded
    await page.waitForURL((url) => url.pathname.startsWith(user.dashboardPath), { timeout: 15_000 });

    // Cardholder nav: positive check first, so the absence checks below can't
    // pass just because the nav hasn't rendered yet.
    await expect(page.locator('a[title="Impact"]')).toBeVisible();
    await expect(page.locator('a[title="Finance"]')).not.toBeVisible();
    await expect(page.locator('a[title="Cardholders"]')).not.toBeVisible();
  });

  // ── TC-002: Yacht Admin ───────────────────────────────────────────────────
  test('TC-002 | Login as Yacht Admin', async ({ page }) => {
    await login(page, USERS['yacht-admin']);
    await expect(page).toHaveURL(/\/dashboard/);

    // Assert Yacht Admin nav items are visible
    await expect(page.locator('a[title="Finance"]')).toBeVisible();
    await expect(page.locator('a[title="Cardholders"]')).toBeVisible();
    await expect(page.locator('a[title="Banking"]')).toBeVisible();
    await expect(page.locator('a[title="Charters"]')).toBeVisible();
    await expect(page.locator('a[title="Manual Ledger"]')).toBeVisible();
  });

  // ── TC-003: Yacht Manager Admin — country comes from the fixture, and this
  //    company shows NO post-2FA account screen (login() skips it when
  //    accountCurrency is unset), so there's no 5s "is it there?" penalty. ────
  test('TC-003 | Login as Yacht Manager Admin', async ({ page }) => {
    await login(page, USERS['yacht-manager-admin']);
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

    // Error shown, and still on the login page
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/user\/login/);
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

    // Error shown, and still on the login / 2FA screen (not logged in)
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/user\/login/);
  });

  test('Shows error when submitting empty form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.clickLogin();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/user\/login/);
  });

  test('Shows error when password is empty', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await loginPage.clickLogin();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/user\/login/);
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
