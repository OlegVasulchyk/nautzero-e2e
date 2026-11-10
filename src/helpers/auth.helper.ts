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

  // 2FA. KNOWN BLOCKER (Nov 2026): staging may show an Airwallex hosted-SCA
  // iframe ("Verify your identity") here instead of the app's OTP screen. Its
  // passcode step accepts the static staging OTP, but the following SMS step
  // sends a real code to the account's real phone and rejects the static OTP
  // (attempts are limited — do NOT brute-force it). Until SCA is disabled for
  // the staging test accounts (or a static SMS code exists), logins can't be
  // automated; tests keep running on the saved .auth/*.json sessions.
  const scaIframe = page.locator('iframe[src*="hosted-sca"]');
  const outcome = await Promise.race([
    loginPage.otpHeading.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'otp' as const),
    scaIframe.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'sca' as const),
  ]).catch(() => 'neither' as const);
  if (outcome === 'sca') {
    throw new Error(
      'Staging login is gated by Airwallex SCA (passcode + SMS to the real phone) — ' +
      'automated login is blocked. Reuse the saved .auth/*.json sessions, or have SCA ' +
      'disabled for the staging test accounts.'
    );
  }
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

