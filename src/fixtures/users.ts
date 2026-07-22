import * as dotenv from 'dotenv';
dotenv.config();

export type UserRole = 'yacht-admin' | 'cardholder' | 'yacht-manager-admin' | 'yacht-admin-card';

export interface UserCredentials {
  phone: string;
  password: string;
  role: UserRole;
  /** Full country name to select in dropdown, e.g. 'United States'. Undefined = default GB. */
  countryName?: string;
  /** Expected URL fragment after successful login */
  dashboardPath: string;
}

export const USERS: Record<UserRole, UserCredentials> = {
  'yacht-admin': {
    phone:         process.env.YACHT_ADMIN_PHONE    ?? '7793297446',
    password:      process.env.YACHT_ADMIN_PASSWORD ?? '',
    role:          'yacht-admin',
    dashboardPath: '/dashboard',
  },
  'cardholder': {
    phone:         process.env.CARDHOLDER_PHONE    ?? '7776580204',
    password:      process.env.CARDHOLDER_PASSWORD ?? '',
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
  'yacht-manager-admin': {
    phone:         process.env.YACHT_MANAGER_PHONE    ?? '5855431909',
    password:      process.env.YACHT_MANAGER_PASSWORD ?? '',
    countryName:   'United States',
    role:          'yacht-manager-admin',
    dashboardPath: '/fleet',
  },
};

/** Static OTP used in the staging environment */
export const STAGING_OTP = process.env.OTP_CODE ?? '739712';
