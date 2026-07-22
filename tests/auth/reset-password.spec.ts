import { test, expect } from '@playwright/test';
import { LoginPage } from '../../src/pages/LoginPage';
import { USERS } from '../../src/fixtures/users';

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password tests
//
// Flow:
//  1. Login page → click "Forgotten your username or password?"
//     → /user/forgot-password  (Forgotten Your Password? form)
//  2. Enter phone → click "Reset My Password"
//     → /user/reset/[id]  (Enter Your Security Code — OTP screen)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reset Password', () => {

  // ── TC-004: Happy path ────────────────────────────────────────────────────
  test('TC-004 | Reset password: submit valid phone shows OTP screen', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Open forgot password form
    await loginPage.forgotPasswordButton.click();
    await expect(page).toHaveURL(/\/user\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'Forgotten Your Password?' })).toBeVisible();

    // Enter valid phone (Yacht Admin — UK number, default country)
    await page.locator('input[type="tel"]').fill(USERS['yacht-admin'].phone);
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    // Assert: redirected to OTP screen
    await page.waitForURL(/\/user\/reset\//, { timeout: 15_000 });
    await expect(loginPage.otpHeading).toBeVisible();
    await expect(page.getByText("We've sent a 6-digit security code")).toBeVisible();
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
    await page.locator('input[type="tel"]').fill('779329');
    await page.getByRole('button', { name: 'Reset My Password' }).click();

    // Server returns error notification: "Unable to process your request right now."
    await expect(page.getByRole('alert', { name: 'Error notification' })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/user\/forgot-password/);
  });

  test('Shows error for non-existing phone number', async ({ page }) => {
    // App returns error notification for numbers not registered in the system
    await page.locator('input[type="tel"]').fill('7129200000');
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

// ─────────────────────────────────────────────────────────────────────────────
// 2FA OTP screen — resend code
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reset Password — OTP screen', () => {

  test('OTP screen: "Didn\'t get your code?" resend button works', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.forgotPasswordButton.click();

    // Submit valid phone to reach OTP screen
    await page.locator('input[type="tel"]').fill(USERS['yacht-admin'].phone);
    await page.getByRole('button', { name: 'Reset My Password' }).click();
    await page.waitForURL(/\/user\/reset\//, { timeout: 15_000 });
    await expect(loginPage.otpHeading).toBeVisible();

    // Resend button is visible and clickable
    await expect(loginPage.resendOtpButton).toBeVisible();
    await loginPage.resendOtpButton.click();

    // Still on OTP screen after resend
    await expect(loginPage.otpHeading).toBeVisible();
  });

});

