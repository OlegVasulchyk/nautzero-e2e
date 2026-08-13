import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Airwallex Issuing sandbox config — used by the AWX simulation API tests.
 *
 * Auth works one of two ways:
 *  - AWX_BEARER_TOKEN — paste a token directly (same as Postman's {{bearer_token}}).
 *  - AWX_CLIENT_ID + AWX_API_KEY — the helper logs in and fetches a token itself,
 *    then optionally elevates it via SCA when AWX_REQUIRE_SCA=true.
 *
 * The card / connected-account defaults come from the shared Postman collection
 * ("Airwallex Issuing — Payment Scenarios"); they are sandbox identifiers, and
 * either can be overridden per-environment via .env.
 */
export const AWX = {
  baseURL:            process.env.AWX_BASE_URL ?? 'https://api-demo.airwallex.com',
  clientId:           process.env.AWX_CLIENT_ID ?? '',
  apiKey:             process.env.AWX_API_KEY ?? '',
  bearerToken:        process.env.AWX_BEARER_TOKEN ?? '',
  /** Some accounts require an SCA-elevated token for privileged operations. */
  requireSca:         process.env.AWX_REQUIRE_SCA === 'true',
  connectedAccountId: process.env.AWX_CONNECTED_ACCOUNT_ID ?? 'acct__yBPdC3zMTC_9uS5dYm5qw',
  cardId:             process.env.AWX_CARD_ID ?? '002727ff-868a-4f53-a9bf-825f7abfff40',
  /** Pinned API version — the simulation payloads below are shaped for this one. */
  apiVersion:         '2024-06-30',
} as const;
