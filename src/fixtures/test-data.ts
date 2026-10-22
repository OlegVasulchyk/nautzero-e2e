// ─────────────────────────────────────────────────────────────────────────────
// Central test-data factory.
//
// Single source for random data used across specs (names, UK phones, emails,
// amounts, DOB, card IDs). Import these instead of re-declaring generators in
// each spec so the rules live in one place.
//
// Rules baked in:
//  • Names contain NO digits — Airwallex name validation blocks digits, which
//    would break card/cardholder actions. Names are suffixed with a tag to stay
//    unique across runs (some flows key off name uniqueness).
//  • Phones are valid UK mobiles (local 07xxxxxxxxx form, passed without +44).
//  • Emails use the ov+<random>@carbonpay.io convention.
// ─────────────────────────────────────────────────────────────────────────────

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Fixed-2-decimal amount string, e.g. "4213.07". */
export function randAmount(min: number, max: number): string {
  return (Math.random() * (max - min) + min).toFixed(2);
}

/** Valid UK mobile local number (prefix 71/72/73/74/75/77/78/79 + 6 digits). */
export function randPhone(): string {
  const prefixes = ['7121', '7234', '7345', '7456', '7567', '7678', '7789', '7890'];
  const prefix = prefixes[randInt(0, prefixes.length - 1)];
  return prefix + String(randInt(100000, 999999));
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Card ID pool for OTU cards (Warcraft heroes). */
export const WARCRAFT = [
  'Arthas', 'Thrall', 'Jaina', 'Sylvanas', 'Illidan',
  'Varian', 'Garrosh', 'Anduin', 'Guldan', 'Khadgar',
] as const;

const FIRST_NAMES = ['James', 'Oliver', 'Liam', 'Noah', 'Ethan', 'Lucas', 'Mason', 'Logan', 'Aiden', 'Elijah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Roberts', 'Walker'];
const NAME_TAGS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];

const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];

/** Digit-free, run-unique first name (Airwallex-safe). */
export function uniqueFirstName(): string {
  return `${pick(FIRST_NAMES)}${pick(NAME_TAGS)}`;
}

/** Digit-free, run-unique last name (Airwallex-safe). */
export function uniqueLastName(): string {
  return `${pick(LAST_NAMES)}${pick(NAME_TAGS)}`;
}

/** Email in the ov+<random>@carbonpay.io convention. */
export function randEmail(): string {
  return `ov+${randInt(100000, 999999)}@carbonpay.io`;
}

export function randWarcraftId(): string {
  return pick(WARCRAFT);
}

/** Random DOB parts for the Day/Month/Year custom dropdowns. */
export function randDob(): { day: string; month: string; year: string } {
  return {
    day: String(randInt(1, 28)),
    month: MONTHS[randInt(0, 11)],
    year: String(randInt(1970, 2000)),
  };
}

export interface CardholderData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  monthlyLimit: string;
}

/**
 * Build a full cardholder data object with valid random values.
 * @param monthlyLimit override the monthly-limit amount (default random 0.09–99999)
 */
export function makeCardholder(monthlyLimit = randAmount(0.09, 99999)): CardholderData {
  const dob = randDob();
  return {
    firstName: uniqueFirstName(),
    lastName: uniqueLastName(),
    phone: randPhone(),
    email: randEmail(),
    dobDay: dob.day,
    dobMonth: dob.month,
    dobYear: dob.year,
    monthlyLimit,
  };
}

/** Physical-card shipping address used in creation and replacement flows. */
export const SHIPPING = {
  street: '15 Snape Hill',
  city: 'Dronfield',
  region: 'Bradford',
  postcode: 'S18 2GH',
} as const;
