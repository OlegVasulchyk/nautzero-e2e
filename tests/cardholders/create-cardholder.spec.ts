import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// TC-032  Create Cardholder — Virtual Card
// TC-033  Create Cardholder — Physical Card
// TC-034  Create OTU (One-Time-Use) Card
//
// Auth: yacht-admin storageState (set in playwright.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ── random data generators ─────────────────────────────────────────
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randAmount(min: number, max: number) {
  return (Math.random() * (max - min) + min).toFixed(2);
}
function randPhone() {
  // Valid UK mobile: 07xxxxxxxxx (10 digits local) — prefix 71/72/73/74/75/77/78/79
  const prefixes = ['7121', '7234', '7345', '7456', '7567', '7678', '7789', '7890'];
  const prefix = prefixes[randInt(0, prefixes.length - 1)];
  const suffix = String(randInt(100000, 999999));
  return prefix + suffix;
}

const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WARCRAFT = ['Arthas','Thrall','Jaina','Sylvanas','Illidan','Varian','Garrosh','Anduin','Guldan','Khadgar'];

// No digits — a name with digits later blocks card/cardholder actions at
// Airwallex's name validation. Suffixed with a random tag to keep each
// cardholder's name unique across runs (some flows key off name uniqueness).
const FIRST_NAMES = ['James', 'Oliver', 'Liam', 'Noah', 'Ethan', 'Lucas', 'Mason', 'Logan', 'Aiden', 'Elijah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Roberts', 'Walker'];
const NAME_TAGS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];

function uniqueFirstName(): string {
  return `${FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]}${NAME_TAGS[randInt(0, NAME_TAGS.length - 1)]}`;
}
function uniqueLastName(): string {
  return `${LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]}${NAME_TAGS[randInt(0, NAME_TAGS.length - 1)]}`;
}

/** Pick a random department option from the open listbox */
async function pickRandomDepartment(page: Page): Promise<void> {
  const options = page.getByRole('listbox').getByRole('option');
  const count = await options.count();
  if (count === 0) throw new Error('Department listbox has no options');
  const randomIndex = randInt(0, count - 1);
  await options.nth(randomIndex).click();
}

const rnd = randInt(100000, 999999);

// ── Test data ─────────────────────────────────────────────────────────────────
const CARDHOLDER_VIRTUAL = {
  firstName:    uniqueFirstName(),
  lastName:     uniqueLastName(),
  phone:        randPhone(),
  email:        `ov+${rnd}@carbonpay.io`,
  dobDay:       String(randInt(1, 28)),
  dobMonth:     MONTHS[randInt(0, 11)],
  dobYear:      String(randInt(1970, 2000)),
  monthlyLimit: randAmount(0.09, 99999),
};

const CARDHOLDER_PHYSICAL = {
  firstName:    uniqueFirstName(),
  lastName:     uniqueLastName(),
  phone:        randPhone(),
  email:        `ov+${randInt(100000, 999999)}@carbonpay.io`,
  dobDay:       String(randInt(1, 28)),
  dobMonth:     MONTHS[randInt(0, 11)],
  dobYear:      String(randInt(1970, 2000)),
  monthlyLimit: randAmount(0.09, 99999),
};

const SHIPPING = {
  street:   '15 Snape Hill',
  city:     'Dronfield',
  region:   'Bradford',
  postcode: 'S18 2GH',
};

const OTU = {
  firstName: uniqueFirstName(),
  lastName:  uniqueLastName(),
  phone:     randPhone(),
  email:     `ov+${randInt(100000, 999999)}@carbonpay.io`,
  limit:     randAmount(1, 5000),
  cardId:    WARCRAFT[randInt(0, WARCRAFT.length - 1)],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fill personal details form (Virtual & Physical step 1) */
async function fillPersonalDetails(page: Page, data: typeof CARDHOLDER_VIRTUAL) {
  await page.getByLabel('First Name').fill(data.firstName);
  await page.getByLabel('Last Name').fill(data.lastName);
  await page.locator('input[type="tel"]').fill(data.phone);
  await page.getByLabel('Email Address').fill(data.email);

  // Department dropdown — open it, then pick a random option from whatever list appears
  await page.getByRole('dialog').getByRole('button', { name: 'Department' }).click();
  await pickRandomDepartment(page);

  // Date of Birth — 3 separate custom dropdowns
  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('option', { name: data.dobDay, exact: true }).click();

  await page.getByRole('button', { name: 'Month' }).click();
  await page.getByRole('option', { name: data.dobMonth }).click();

  await page.getByRole('button', { name: 'Year' }).click();
  await page.getByRole('option', { name: data.dobYear }).click();

  await page.getByLabel('Set Monthly Card Limit').fill(data.monthlyLimit);
}

/** Fill shipping address form (Physical step 2) */
async function fillShippingAddress(page: Page) {
  await page.getByRole('textbox', { name: 'Street Address', exact: true }).fill(SHIPPING.street);
  await page.getByLabel('City / Town').fill(SHIPPING.city);

  // State / Region searchable dropdown
  await page.getByRole('button', { name: 'State / Region' }).click();
  await page.getByRole('option', { name: SHIPPING.region, exact: true }).click();

  await page.getByLabel('Postcode').fill(SHIPPING.postcode);
}

// ── TC-032: Virtual Card ───────────────────────────────────────────────────────
test.describe('TC-032 | Create Virtual Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-032 | Opens drawer, fills form, confirms virtual card creation', async ({ page }) => {
    await page.goto('/cardholders');
    await expect(page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();

    // Open drawer
    await page.getByRole('button', { name: 'Add a Cardholder' }).click();
    await expect(page.getByRole('dialog', { name: 'Order A Cardholder' })).toBeVisible();

    // Select Virtual
    await page.getByRole('button', { name: 'Virtual' }).click();
    await expect(page.getByRole('heading', { name: 'Virtual Card' })).toBeVisible();

    // Step 1: Personal Details
    await fillPersonalDetails(page, CARDHOLDER_VIRTUAL);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Confirm screen
    await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).toBeVisible({ timeout: 10_000 });
    const virtualDialog = page.getByRole('dialog', { name: 'Confirm Virtual Card Details' });
    await expect(virtualDialog.getByText(`${CARDHOLDER_VIRTUAL.firstName} ${CARDHOLDER_VIRTUAL.lastName}`)).toBeVisible();
    await expect(virtualDialog.getByText('Virtual', { exact: true })).toBeVisible();

    // Confirm creation
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Confirm heading disappears → drawer transitioned away; success toast appears
    await expect(page.getByRole('heading', { name: 'Confirm Virtual Card Details' })).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('successfully', { exact: false })).toBeVisible({ timeout: 60_000 });
  });

});

// ── TC-033: Physical Card ─────────────────────────────────────────────────────
test.describe('TC-033 | Create Physical Cardholder', () => {
  test.setTimeout(120_000);

  test('TC-033 | Opens drawer, fills form + address, confirms physical card creation', async ({ page }) => {
    await page.goto('/cardholders');
    await expect(page.getByRole('heading', { name: 'Cardholders' })).toBeVisible();

    // Open drawer
    await page.getByRole('button', { name: 'Add a Cardholder' }).click();
    await expect(page.getByRole('dialog', { name: 'Order A Cardholder' })).toBeVisible();

    // Select Physical
    await page.getByRole('button', { name: 'Physical' }).click();
    await expect(page.getByRole('heading', { name: 'Physical Card' })).toBeVisible();

    // Step 1: Personal Details
    await fillPersonalDetails(page, CARDHOLDER_PHYSICAL);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Shipping Address
    await expect(page.getByRole('heading', { name: 'Shipping Address' })).toBeVisible({ timeout: 10_000 });
    await fillShippingAddress(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: Confirm screen
    await expect(page.getByRole('heading', { name: 'Confirm Physical Card Details' })).toBeVisible({ timeout: 10_000 });
    const physicalDialog = page.getByRole('dialog', { name: 'Confirm Physical Card Details' });
    await expect(physicalDialog.getByText(`${CARDHOLDER_PHYSICAL.firstName} ${CARDHOLDER_PHYSICAL.lastName}`)).toBeVisible();
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
    await page.goto('/cardholders');

    // Navigate to OTU page via button
    await page.getByRole('button', { name: 'One-Time-Use Cards' }).click();
    await expect(page).toHaveURL(/\/cardholders\/one-time-use-cards/);
    await expect(page.getByRole('heading', { name: 'One-Time-Use Cards' })).toBeVisible();

    // Open OTU drawer
    await page.getByRole('button', { name: 'Add a One-Time-Use Card' }).click();
    await expect(page.getByRole('heading', { name: 'Add a One Time Use Card' })).toBeVisible();

    // Fill OTU form
    await page.getByLabel('First Name').fill(OTU.firstName);
    await page.getByLabel('Last Name').fill(OTU.lastName);
    await page.locator('input[type="tel"]').fill(OTU.phone);
    await page.getByLabel('Email Address').fill(OTU.email);
    await page.getByLabel('Card Limit').fill(OTU.limit);
    await page.getByRole('textbox', { name: 'Card ID' }).fill(OTU.cardId); // Warcraft hero name

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
