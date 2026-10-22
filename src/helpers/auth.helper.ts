import { type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { type UserCredentials, STAGING_OTP } from '../fixtures/users';

/**
 * Full login flow:
 *  1. Navigate to /user/login
 *  2. (Optional) Switch country if not GB
 *  3. Fill phone + password → click Login
 *  4. Enter 6-digit OTP → click Continue
 *  5. (Optional) Select Account USD/EUR — only for accounts that show that screen
 *  6. Accept Terms & Conditions if policy-acceptance page appears
 *
 * Returns after the dashboard is loaded.
 */
export async function login(page: Page, user: UserCredentials, otp = STAGING_OTP): Promise<void> {
  const loginPage = new LoginPage(page);

  await loginPage.goto();

  // Select country from dropdown if not default GB
  if (user.countryName) {
    await loginPage.selectCountry(user.countryName);
  }

  await loginPage.fillPhone(user.phone);
  await loginPage.fillPassword(user.password);
  await loginPage.clickLogin();

  // 2FA
  await loginPage.fillOtp(otp);
  await loginPage.submitOtp();

  // Select Account (USD/EUR) — only for accounts that show this screen after 2FA.
  // Skipped when accountCurrency is unset, so the other roles don't each pay the
  // 5s "is the screen there?" timeout on every login.
  if (user.accountCurrency) {
    await loginPage.selectAccountIfPresent(user.accountCurrency);
  }

  // Wait for navigation away from /user/login
  await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });

  // Handle policy-acceptance (first-time login only)
  await loginPage.acceptPolicyIfPresent();

  // Wait for the role's landing page after login
  await page.waitForURL((url) => url.pathname.startsWith(user.dashboardPath), { timeout: 15_000 });
}

/**
 * Logout helper — navigate to logout endpoint or click the logout button.
 * Adjust the selector/URL to match the actual logout mechanism.
 */
export async function logout(page: Page): Promise<void> {
  // Try navigating to a logout route first; adjust if app uses a button
  await page.goto('/user/logout');
  await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 10_000 });
}
