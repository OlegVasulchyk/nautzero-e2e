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
  /** Account currency to select on the post-2FA "Select Your Account" screen — Yacht Manager Admin only. Defaults to 'usd'. */
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

export const USERS: Record<UserRole, UserCredentials> = {
  'yacht-admin': {
    phone:         process.env.YACHT_ADMIN_PHONE    ?? '7793297446',
    password:      process.env.YACHT_ADMIN_PASSWORD ?? '',
    countryName:   resolveCountryName(process.env.YACHT_ADMIN_COUNTRY),
    role:          'yacht-admin',
    dashboardPath: '/dashboard',
  },
  'cardholder': {
    phone:         process.env.CARDHOLDER_PHONE    ?? '7776580204',
    password:      process.env.CARDHOLDER_PASSWORD ?? '',
    countryName:   resolveCountryName(process.env.CARDHOLDER_COUNTRY),
    role:          'cardholder',
    dashboardPath: '/dashboard',
  },
  // Yacht Admin who has a personal card on their dashboard (used for card freeze/unfreeze tests)
  'yacht-admin-card': {
    phone:         process.env.YACHT_ADMIN_CARD_PHONE    ?? '7771777139',
    password:      process.env.YACHT_ADMIN_CARD_PASSWORD ?? '',
    role:          'yacht-admin-card',
    dashboardPath: '/dashboard',
  },
  // Cardholder who owns a PHYSICAL card (dashboard: View PIN, Freeze/Unfreeze, View card details)
  'cardholder-physical': {
    phone:         process.env.CARDHOLDER_PHYSICAL_PHONE    ?? '7745630803',
    password:      process.env.CARDHOLDER_PHYSICAL_PASSWORD ?? '',
    role:          'cardholder-physical',
    dashboardPath: '/dashboard',
  },
  // Cardholder who owns a VIRTUAL card (dashboard: Freeze/Unfreeze, View card details — no PIN)
  'cardholder-virtual': {
    phone:         process.env.CARDHOLDER_VIRTUAL_PHONE    ?? '7788228399',
    password:      process.env.CARDHOLDER_VIRTUAL_PASSWORD ?? '',
    role:          'cardholder-virtual',
    dashboardPath: '/dashboard',
  },
  'yacht-manager-admin': {
    phone:          process.env.YACHT_MANAGER_PHONE    ?? '5855431909',
    password:       process.env.YACHT_MANAGER_PASSWORD ?? '',
    countryName:    resolveCountryName(process.env.YACHT_MANAGER_COUNTRY) ?? 'United States',
    accountCurrency: 'usd',
    role:           'yacht-manager-admin',
    dashboardPath:  '/fleet',
  },
  // Same Yacht Manager Admin login — selects the EUR account on the post-2FA
  // "Select Your Account" screen instead of USD.
  'yacht-manager-admin-eur': {
    phone:          process.env.YACHT_MANAGER_PHONE    ?? '5855431909',
    password:       process.env.YACHT_MANAGER_PASSWORD ?? '',
    countryName:    resolveCountryName(process.env.YACHT_MANAGER_COUNTRY) ?? 'United States',
    accountCurrency: 'eur',
    role:           'yacht-manager-admin-eur',
    dashboardPath:  '/fleet',
  },
};

/** Static OTP used in the staging environment */
export const STAGING_OTP = process.env.OTP_CODE ?? '739712';
