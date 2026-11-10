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

/** Per-role spec of where its values live in .env and how it logs in. */
interface RoleSpec {
  envPrefix: string;
  dashboardPath: string;
  accountCurrency?: 'usd' | 'eur';
}

const ROLE_SPECS: Record<UserRole, RoleSpec> = {
  'yacht-admin':             { envPrefix: 'YACHT_ADMIN',          dashboardPath: '/dashboard' },
  'cardholder':              { envPrefix: 'CARDHOLDER',           dashboardPath: '/dashboard' },
  // Yacht Admin who has a personal card on their dashboard (used for card freeze/unfreeze tests)
  'yacht-admin-card':        { envPrefix: 'YACHT_ADMIN_CARD',     dashboardPath: '/dashboard' },
  // Cardholder who owns a PHYSICAL card (dashboard: View PIN, Freeze/Unfreeze, View card details)
  'cardholder-physical':     { envPrefix: 'CARDHOLDER_PHYSICAL',  dashboardPath: '/dashboard' },
  // Cardholder who owns a VIRTUAL card (dashboard: Freeze/Unfreeze, View card details — no PIN)
  'cardholder-virtual':      { envPrefix: 'CARDHOLDER_VIRTUAL',   dashboardPath: '/dashboard' },
  // Regular Yacht Manager Admin (GB). This company's flow has NO post-2FA account
  // screen — currency is picked when creating a boat, so accountCurrency stays unset.
  'yacht-manager-admin':     { envPrefix: 'YACHT_MANAGER',        dashboardPath: '/fleet' },
  // Separate EUR account (US number) — this one DOES show the post-2FA
  // "Select Your Account" screen, where EUR is chosen.
  'yacht-manager-admin-eur': { envPrefix: 'YACHT_MANAGER_EUR',    dashboardPath: '/fleet', accountCurrency: 'eur' },
};

/** Every known role — iterate this (e.g. in auth.setup.ts) instead of Object.keys(USERS). */
export const USER_ROLES = Object.keys(ROLE_SPECS) as UserRole[];

/** storageState file for a role, shared between auth.setup.ts and playwright.config.ts. */
export function authFile(role: UserRole): string {
  return `.auth/${role}.json`;
}

function buildUser(role: UserRole): UserCredentials {
  const spec = ROLE_SPECS[role];
  return {
    phone:           required(`${spec.envPrefix}_PHONE`),
    password:        required(`${spec.envPrefix}_PASSWORD`),
    countryName:     resolveCountryName(process.env[`${spec.envPrefix}_COUNTRY`]),
    accountCurrency: spec.accountCurrency,
    role,
    dashboardPath:   spec.dashboardPath,
  };
}

/**
 * Credentials are resolved lazily (on property access, not import), so a spec
 * that needs only one role — or only STAGING_OTP — doesn't fail on other
 * roles' missing .env values.
 */
export const USERS: Record<UserRole, UserCredentials> = new Proxy({} as Record<UserRole, UserCredentials>, {
  get: (_target, role) => (typeof role === 'string' && role in ROLE_SPECS ? buildUser(role as UserRole) : undefined),
  has: (_target, role) => typeof role === 'string' && role in ROLE_SPECS,
  ownKeys: () => USER_ROLES,
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Static OTP used in the staging environment */
export const STAGING_OTP = required('OTP_CODE');
