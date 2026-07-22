import { test, expect } from '@playwright/test';
import { LoginPage } from '../../src/pages/LoginPage';
import { login } from '../../src/helpers/auth.helper';
import { USERS, STAGING_OTP } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// TC-004  Reset Password
//
// NOTE: This test covers the UI flow up to the reset link submission.
// The email interception step requires a mail testing service
// (Mailhog / Mailpit / similar) accessible from the test environment.
// The `getResetLink()` helper below is a placeholder — replace with
// your actual mail API call.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Placeholder: retrieve the password reset link from the test mail server.
 * Replace with your actual Mailhog / Mailpit API call, e.g.:
 *
 *   const res = await fetch('http://localhost:8025/api/v2/messages');
 *   const json = await res.json();
 *   // parse the reset link from the latest email body
 */
async function getResetLink(_email: string): Promise<string> {
  throw new Error(
    'getResetLink() not implemented. ' +
    'Integrate with your mail testing service (Mailhog/Mailpit) to retrieve the reset URL.'
  );
}

test.describe('Reset Password — TC-004', () => {

  test('TC-004 | Reset password flow with 2FA', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // ── Step 1: Navigate to login page ──────────────────────────────────────
    await loginPage.goto();
    await expect(page).toHaveURL(/\/user\/login/);

    // ── Step 2: Open Forgot Password form ───────────────────────────────────
    await loginPage.forgotPasswordButton.click();

    // Forgot password form should appear (modal or new page)
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });

    // ── Step 3: Enter registered email and submit ────────────────────────────
    // Using Yacht Admin phone-linked email — update to the actual registered email
    const testEmail = process.env.YACHT_ADMIN_EMAIL ?? 'yacht-admin@test.nautzero.com';
    await emailInput.fill(testEmail);

    const sendButton = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Reset")').first();
    await sendButton.click();

    // ── Step 4: Assert success message ──────────────────────────────────────
    await expect(
      page.locator('text=/sent|check your|email/i').first()
    ).toBeVisible({ timeout: 8_000 });

    // ── Step 5: Get reset link from mail server ──────────────────────────────
    // TODO: implement getResetLink() with your mail testing service
    let resetLink: string;
    try {
      resetLink = await getResetLink(testEmail);
    } catch {
      test.skip(true, 'Mail server not configured — skipping reset link steps.');
      return;
    }

    // ── Step 6: Open reset link ──────────────────────────────────────────────
    await page.goto(resetLink);

    const newPasswordInput    = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);
    await expect(newPasswordInput).toBeVisible();

    // ── Step 7: Set new password ─────────────────────────────────────────────
    const newPassword = 'NewPass12345!';
    await newPasswordInput.fill(newPassword);
    await confirmPasswordInput.fill(newPassword);
    await page.locator('button[type="submit"]').click();

    // ── Step 8: 2FA appears after password reset ─────────────────────────────
    await expect(loginPage.otpHeading).toBeVisible({ timeout: 10_000 });
    await loginPage.fillOtp(STAGING_OTP);
    await loginPage.submitOtp();

    // ── Step 9: Assert user is logged in ─────────────────────────────────────
    await page.waitForURL((url) => !url.pathname.startsWith('/user/login'), { timeout: 15_000 });
    await loginPage.acceptPolicyIfPresent();
    await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
