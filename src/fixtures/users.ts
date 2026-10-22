import * as dotenv from 'dotenv';
dotenv.config();

export type UserRole =
  | 'yacht-admin'
  | 'cardholder'
  | 'yacht-manager-admin'
  | 'yacht-manager-admin-eur'
  | 'yacht-admin-card'
  | 'cardholder-physical'
  | 'cardholder-virtual';

export interface UserCredentials {
  phone: string;
  password: string;
  role: UserRole;
  /** Full country name to select in dropdown, e.g. 'United States'. Undefined = default GB. */
  countryName?: string;
  /**
   * Currency to pick on the post-2FA "Select Your Account" screen. Only set it for
   * accounts that actually show that screen — leaving it undefined skips the step.
   * The regular Yacht Manager Admin's company has a different flow: no account
   * screen at all, currency is chosen when creating a boat instead.
   */
  accountCurrency?: 'usd' | 'eur';
  /** Expected URL fragment after successful login */
  dashboardPath: string;
}

/** ISO alpha-2 codes as used in .env (e.g. "GB", "US") → full name the dropdown shows. */
const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom',
  US: 'United States',
};

/** Resolve a *_COUNTRY env value (ISO code) to the full name selectCountry() needs. */
function resolveCountryName(code?: string): string | undefined {
  if (!code) return undefined;
  return COUNTRY_NAMES[code.toUpperCase()] ?? code;
}

/**
 * Read a credential from .env. Credentials live only in .env — nothing is
 * hardcoded here — so a missing value is a setup error worth failing loudly on,
 * rather than logging in with an empty field and failing somewhere confusing.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env — copy .env.example to .env and fill in the values.`);
  }
  return value;
}

export const USERS: Record<UserRole, UserCredentials> = {
  'yacht-admin': {
    phone:         required('YACHT_ADMIN_PHONE'),
    password:      required('YACHT_ADMIN_PASSWORD'),
    countryName:   resolveCountryName(process.env.YACHT_ADMIN_COUNTRY),
    role:          'yacht-admin',
    dashboardPath: '/dashboard',
  },
  'cardholder': {
    phone:         required('CARDHOLDER_PHONE'),
    password:      required('CARDHOLDER_PASSWORD'),
    countryName:   resolveCountryName(process.env.CARDHOLDER_COUNTRY),
    role:          'cardholder',
    dashboardPath: '/dashboard',
  },
  // Yacht Admin who has a personal card on their dashboard (used for card freeze/unfreeze tests)
  'yacht-admin-card': {
    phone:         required('YACHT_ADMIN_CARD_PHONE'),
    password:      required('YACHT_ADMIN_CARD_PASSWORD'),
    countryName:   resolveCountryName(process.env.YACHT_ADMIN_CARD_COUNTRY),
    role:          'yacht-admin-card',
    dashboardPath: '/dashboard',
  },
  // Cardholder who owns a PHYSICAL card (dashboard: View PIN, Freeze/Unfreeze, View card details)
  'cardholder-physical': {
    phone:         required('CARDHOLDER_PHYSICAL_PHONE'),
    password:      required('CARDHOLDER_PHYSICAL_PASSWORD'),
    countryName:   resolveCountryName(process.env.CARDHOLDER_PHYSICAL_COUNTRY),
    role:          'cardholder-physical',
    dashboardPath: '/dashboard',
  },
  // Cardholder who owns a VIRTUAL card (dashboard: Freeze/Unfreeze, View card details — no PIN)
  'cardholder-virtual': {
    phone:         required('CARDHOLDER_VIRTUAL_PHONE'),
    password:      required('CARDHOLDER_VIRTUAL_PASSWORD'),
    countryName:   resolveCountryName(process.env.CARDHOLDER_VIRTUAL_COUNTRY),
    role:          'cardholder-virtual',
    dashboardPath: '/dashboard',
  },
  // Regular Yacht Manager Admin (GB). This company's flow has NO post-2FA account
  // screen — currency is picked when creating a boat, so accountCurrency stays unset.
  'yacht-manager-admin': {
    phone:          required('YACHT_MANAGER_PHONE'),
    password:       required('YACHT_MANAGER_PASSWORD'),
    countryName:    resolveCountryName(process.env.YACHT_MANAGER_COUNTRY),
    role:           'yacht-manager-admin',
    dashboardPath:  '/fleet',
  },
  // Separate EUR account (US number) — this one DOES show the post-2FA
  // "Select Your Account" screen, where EUR is chosen.
  'yacht-manager-admin-eur': {
    phone:          required('YACHT_MANAGER_EUR_PHONE'),
    password:       required('YACHT_MANAGER_EUR_PASSWORD'),
    countryName:    resolveCountryName(process.env.YACHT_MANAGER_EUR_COUNTRY),
    accountCurrency: 'eur',
    role:           'yacht-manager-admin-eur',
    dashboardPath:  '/fleet',
  },
};

/** Static OTP used in the staging environment */
export const STAGING_OTP = required('OTP_CODE');
