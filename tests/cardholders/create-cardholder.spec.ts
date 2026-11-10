import { test, expect } from '@playwright/test';
import { CardholdersPage } from '../../src/pages/CardholdersPage';
import { makeCardholder, randAmount, randWarcraftId, SHIPPING } from '../../src/fixtures/test-data';

// ─────────────────────────────────────────────────────────────────────────────
// TC-032  Create Cardholder — Virtual Card
// TC-033  Create Cardholder — Physical Card
// TC-034  Create OTU (One-Time-Use) Card
//
// Test data comes from src/fixtures/test-data.ts (digit-free Airwallex-safe
// names, valid UK phones, ov+<random>@carbonpay.io emails) and is generated
// inside each test, not at import time.
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ── TC-032: Virtual Card ───────────────────────────────────────────────────────
test.describe('TC-032 | Create Virtual Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-032 | Opens drawer, fills form, confirms virtual card creation', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    const data = makeCardholder();

    await cardholders.open();
    await cardholders.openAddCardholderDrawer('Virtual');

    // Step 1: Personal Details
    await cardholders.fillPersonalDetails(data);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Confirm screen
    await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).toBeVisible({ timeout: 10_000 });
    const virtualDialog = page.getByRole('dialog', { name: 'Confirm Virtual Card Details' });
    await expect(virtualDialog.getByText(`${data.firstName} ${data.lastName}`)).toBeVisible();
    await expect(virtualDialog.getByText('Virtual', { exact: true })).toBeVisible();

    // Confirm creation
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Confirm heading disappears → drawer transitioned away; success toast appears
    // (backend card creation can take up to ~60s)
    await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('successfully', { exact: false })).toBeVisible({ timeout: 60_000 });
  });

});

// ── TC-033: Physical Card ─────────────────────────────────────────────────────
test.describe('TC-033 | Create Physical Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-033 | Opens drawer, fills form + address, confirms physical card creation', async ({ page }) => {
    const cardholders = new CardholdersPage(page);
    const data = makeCardholder();

    await cardholders.open();
    await cardholders.openAddCardholderDrawer('Physical');

    // Step 1: Personal Details
    await cardholders.fillPersonalDetails(data);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Shipping Address
    await expect(page.getByRole('heading', { name: 'Shipping Address' })).toBeVisible({ timeout: 10_000 });
    await cardholders.fillShippingAddress();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: Confirm screen
    await expect(page.getByRole('heading', { name: 'Confirm Physical Card Details' })).toBeVisible({ timeout: 10_000 });
    const physicalDialog = page.getByRole('dialog', { name: 'Confirm Physical Card Details' });
    await expect(physicalDialog.getByText(`${data.firstName} ${data.lastName}`)).toBeVisible();
    await expect(physicalDialog.getByText('Physical', { exact: true })).toBeVisible();
    await expect(physicalDialog.getByText(SHIPPING.street, { exact: false })).toBeVisible();

    // Confirm creation
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Confirm heading disappears → drawer transitioned away; success toast appears
    await expect(page.getByRole('heading', { name: 'Confirm Physical Card Details' })).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('successfully', { exact: false })).toBeVisible({ timeout: 60_000 });
  });

});

// ── TC-034: OTU Card ──────────────────────────────────────────────────────────
test.describe('TC-034 | Create OTU Card', () => {

  test('TC-034 | Navigates to OTU page, fills form, creates one-time-use card', async ({ page }) => {
    const otu = {
      ...makeCardholder(),
      limit: randAmount(1, 5000),
      cardId: randWarcraftId(),
    };

    await page.goto('/cardholders');

    // Navigate to OTU page via button
    await page.getByRole('button', { name: 'One-Time-Use Cards' }).click();
    await expect(page).toHaveURL(/\/cardholders\/one-time-use-cards/);
    await expect(page.getByRole('heading', { name: 'One-Time-Use Cards' })).toBeVisible();

    // Open OTU drawer
    await page.getByRole('button', { name: 'Add a One-Time-Use Card' }).click();
    await expect(page.getByRole('heading', { name: 'Add a One Time Use Card' })).toBeVisible();

    // Fill OTU form
    await page.getByLabel('First Name').fill(otu.firstName);
    await page.getByLabel('Last Name').fill(otu.lastName);
    await page.locator('input[type="tel"]').fill(otu.phone);
    await page.getByLabel('Email Address').fill(otu.email);
    await page.getByLabel('Card Limit').fill(otu.limit);
    await page.getByRole('textbox', { name: 'Card ID' }).fill(otu.cardId); // Warcraft hero name

    // Note visible on form
    await expect(page.getByText('all OTU will expire after 10 days', { exact: false })).toBeVisible();

    // Submit → goes to confirmation screen
    await page.getByRole('button', { name: 'Continue' }).click();

    // Confirm screen
    await expect(page.getByRole('dialog', { name: 'Confirm one-time-use card details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Confirm heading disappears → card created successfully
    await expect(page.getByRole('heading', { name: 'Confirm one-time-use card details', exact: false })).not.toBeVisible({ timeout: 15_000 });
  });

});
