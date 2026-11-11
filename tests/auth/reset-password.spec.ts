import { test, expect } from '../../src/fixtures/test';
import { LoginPage } from '../../src/pages/LoginPage';
import { USERS } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password tests
//
// Flow:
//  1. Login page → click "Forgotten your username or password?"
//     → /user/forgot-password  (Forgotten Your Password? form)
//  2. Enter phone → click "Reset My Password"
//     → "Check Your Messages" confirmation (the reset link is sent to the phone)
//
// DOM-verified Nov 2026: this flow no longer has an OTP screen at
// /user/reset/<id>, so the old "resend code on the reset OTP screen" test was
// removed with it (the resend button is still covered on the login 2FA screen).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reset Password', () => {

  // ── TC-004: Happy path ────────────────────────────────────────────────────
  test('TC-004 | Reset password: submit valid phone shows "Check Your Messages"', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Open forgot password form
    await loginPage.forgotPasswordButton.click();
    await expect(page).toHaveURL(/\/user\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'Forgotten Your Password?' })).toBeVisible();

    // Enter valid phone (Yacht Admin — UK number, default country)
    await loginPage.fillPhone(USERS['yacht-admin'].phone);
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    // Confirmation screen, which leads back to login
    await expect(page.getByRole('heading', { name: 'Check Your Messages' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Return to login page' }).click();
    await expect(page).toHaveURL(/\/user\/login/);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password — negative cases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reset Password — negative cases', () => {

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.forgotPasswordButton.click();
    await expect(page).toHaveURL(/\/user\/forgot-password/);
  });

  test('Shows error when submitting empty form', async ({ page }) => {
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    // Inline alert: "Please enter your mobile number."
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/user\/forgot-password/);
  });

  test('Shows error when phone number is incomplete', async ({ page }) => {
    // Enter only 6 digits — invalid/incomplete UK phone
    await new LoginPage(page).fillPhone('779329');
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    // Inline validation (DOM-verified Nov 2026): "*Please enter a valid mobile number."
    await expect(page.getByRole('alert').filter({ hasText: 'Please enter a valid mobile number' })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/user\/forgot-password/);
  });

  test('Shows error for non-existing phone number', async ({ page }) => {
    // App returns error notification for numbers not registered in the system
    await new LoginPage(page).fillPhone('7129200000');
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    await expect(page.getByRole('alert', { name: 'Error notification' })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/user\/forgot-password/);
  });

  test('"Return to login page" navigates back to login', async ({ page }) => {
    await page.getByRole('button', { name: 'Return to login page' }).click();
    await expect(page).toHaveURL(/\/user\/login/);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

});
