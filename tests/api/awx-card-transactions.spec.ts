import { test, expect } from '@playwright/test';
import { AirwallexClient } from '../../src/helpers/airwallex.helper';

// ─────────────────────────────────────────────────────────────────────────────
// TC-074…TC-084  Card transactions via the Airwallex Issuing simulation API
//
// Ported from the shared Postman collection "Airwallex Issuing — Payment
// Scenarios". These are pure API tests — no browser, no NautZero login. They
// create real data in the AWX sandbox, which is what surfaces the staging
// transactions you see on the NautZero dashboards.
//
// Auth: AWX_BEARER_TOKEN, or AWX_CLIENT_ID + AWX_API_KEY (see src/fixtures/airwallex.ts)
// Run:  npx playwright test --project=awx-api
// ─────────────────────────────────────────────────────────────────────────────

// Merchants mirror the collection (and match the suppliers already visible in
// NautZero staging transactions).
const MERCHANTS = {
  beachClub:   { mcc: '5812', info: 'SCORPIOS BEACH CLUB      MYKONOS      GR' },
  hotel:       { mcc: '7011', info: 'HOTEL DE PARIS           MONTE CARLO  MC' },
  marineStore: { mcc: '5551', info: 'GARMIN MARINE STORE      PALMA        ES' },
  restaurant:  { mcc: '5812', info: 'NAMMOS RESTAURANT        MYKONOS      GR' },
  streaming:   { mcc: '4899', info: 'DISNEY PLUS SUBSCRIPTION LONDON       GB' },
  amazon:      { mcc: '5942', info: 'AMAZON.COM               SEATTLE      US' },
  gasStation:  { mcc: '5542', info: 'E.LECLERC                ORSCHWILLER  FR' },
  harrods:     { mcc: '5661', info: 'HARRODS                  LONDON       GB' },
  netflix:     { mcc: '4899', info: 'NETFLIX                  LOS GATOS    CA' },
  spotify:     { mcc: '4899', info: 'SPOTIFY                  NEW YORK     US' },
  atm:         { mcc: '6011', info: 'ATM WITHDRAWAL           MONACO       MC' },
  gucci:       { mcc: '5661', info: 'GUCCI STORE              PORTOFINO    IT' },
} as const;

let awx: AirwallexClient;

test.beforeAll(async () => {
  awx = await AirwallexClient.create();
});

test.afterAll(async () => {
  await awx?.dispose();
});

// ── TC-074: Single-phase (auth + capture at once) ────────────────────────────
test('TC-074 | Single-phase transaction is APPROVED and CLEARING', async () => {
  const { status, body } = await awx.createTransaction({
    ...{ merchant_category_code: MERCHANTS.beachClub.mcc, merchant_info: MERCHANTS.beachClub.info },
    transaction_amount: 120.0,
    transaction_currency: 'USD',
    single_phase: true,
  });

  expect(status).toBe(201);
  expect(body.status).toBe('APPROVED');
  expect(body.transaction_type).toBe('CLEARING');
  expect(body.transaction_id).toBeTruthy();
});

// ── TC-075: Dual-phase (PENDING → SETTLED) ───────────────────────────────────
test('TC-075 | Dual-phase transaction goes PENDING then APPROVED on capture', async () => {
  const amount = 80.0;

  const auth = await test.step('Authorization (PENDING)', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.hotel.mcc,
      merchant_info: MERCHANTS.hotel.info,
      transaction_amount: amount,
      transaction_currency: 'EUR',
      single_phase: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.transaction_type).toBe('AUTHORIZATION');
    return res.body;
  });

  await test.step('Capture (APPROVED)', async () => {
    // Capture the authorized amount. NOTE: the Postman collection captures
    // 980.00 against an 80.00 authorization — that looks like a typo, so we
    // capture what was actually authorized.
    const res = await awx.capture(auth.transaction_id, amount);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.transaction_type).toBe('CLEARING');
  });
});

// ── TC-076: Partial capture (remainder auto-reversed) ────────────────────────
test('TC-076 | Partial capture approves the lower amount', async () => {
  const auth = await test.step('Authorization €500', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.marineStore.mcc,
      merchant_info: MERCHANTS.marineStore.info,
      transaction_amount: 500.0,
      transaction_currency: 'EUR',
      single_phase: false,
    });
    expect(res.body.status).toBe('PENDING');
    return res.body;
  });

  await test.step('Partial capture €350 — remaining €150 auto-reversed', async () => {
    const res = await awx.capture(auth.transaction_id, 350.0);
    expect(res.body.status).toBe('APPROVED');
  });
});

// ── TC-077: Reversal before capture ──────────────────────────────────────────
test('TC-077 | Authorization can be reversed before capture', async () => {
  const amount = 610.0;

  const auth = await test.step('Authorization', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.restaurant.mcc,
      merchant_info: MERCHANTS.restaurant.info,
      transaction_amount: amount,
      transaction_currency: 'EUR',
      single_phase: false,
    });
    expect(res.body.status).toBe('PENDING');
    return res.body;
  });

  await test.step('Reversal', async () => {
    const res = await awx.reverse(auth.transaction_id, amount);
    // NOTE: the Postman collection asserts transaction_type === 'REVERSAL', but the
    // API keeps transaction_type as AUTHORIZATION and moves status to REVERSED —
    // the reversal updates the original transaction rather than creating a new one.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REVERSED');
    expect(res.body.transaction_id).toBe(auth.transaction_id);
  });
});

// ── TC-078: Failed transactions ──────────────────────────────────────────────
const FAILURE_CASES = [
  { reason: 'TRANSACTION_BLOCKED', merchant: MERCHANTS.streaming, amount: 8.99 },
  { reason: 'CVV_INVALID',         merchant: MERCHANTS.amazon,    amount: 150.0 },
];

for (const { reason, merchant, amount } of FAILURE_CASES) {
  test(`TC-078 | Transaction fails with ${reason}`, async () => {
    const { body } = await awx.createTransaction({
      merchant_category_code: merchant.mcc,
      merchant_info: merchant.info,
      transaction_amount: amount,
      transaction_currency: 'EUR',
      transaction_failure_reason: reason,
    });

    expect(body.status).toBe('FAILED');
    expect(body.failure_reason).toBe(reason);
  });
}

// ── TC-079: Pay-at-pump (auth → partial clearing → incremental auth) ────────
test('TC-079 | Pay-at-pump lifecycle settles the full authorized amount', async () => {
  const firstAuth = await test.step('Authorization €150', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.gasStation.mcc,
      merchant_info: MERCHANTS.gasStation.info,
      transaction_amount: 150.0,
      transaction_currency: 'EUR',
      single_phase: false,
    });
    expect(res.body.status).toBe('PENDING');
    return res.body;
  });

  await test.step('Capture €114.87 (fuel)', async () => {
    const res = await awx.capture(firstAuth.transaction_id, 114.87);
    expect(res.body.status).toBe('APPROVED');
  });

  const secondAuth = await test.step('Incremental authorization €35.13 (shop)', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.gasStation.mcc,
      merchant_info: MERCHANTS.gasStation.info,
      transaction_amount: 35.13,
      transaction_currency: 'EUR',
      single_phase: false,
      transaction_id: firstAuth.transaction_id, // links into the same lifecycle
    });
    expect(res.body.status).toBe('PENDING');
    return res.body;
  });

  await test.step('Capture €35.13 (remainder settled)', async () => {
    const res = await awx.capture(secondAuth.transaction_id, 35.13);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.transaction_type).toBe('CLEARING');
  });
});

// ── TC-080: FX transaction (GBP on a EUR card) ───────────────────────────────
test('TC-080 | FX transaction reports transaction and billing amounts', async () => {
  const { status, body } = await awx.createTransaction({
    merchant_category_code: MERCHANTS.harrods.mcc,
    merchant_info: MERCHANTS.harrods.info,
    transaction_amount: 500.0,
    transaction_currency: 'GBP',
    single_phase: true,
  });

  expect(status).toBe(201);
  expect(body.transaction_currency).toBe('GBP');
  // Amounts come back negative (debits), so compare magnitudes.
  expect(Math.abs(body.transaction_amount)).toBeCloseTo(500.0, 2);
  expect(Math.abs(body.billing_amount ?? 0)).toBeGreaterThan(0);
  // Billed in the card's own currency — so the billing side must differ from GBP.
  expect(body.billing_currency).not.toBe('GBP');
});

// ── TC-081: Hotel pre-auth → lower checkout capture ──────────────────────────
test('TC-081 | Hotel pre-auth captures less than the deposit at checkout', async () => {
  const preAuth = await test.step('Check-in pre-auth €2000', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.hotel.mcc,
      merchant_info: MERCHANTS.hotel.info,
      transaction_amount: 2000.0,
      transaction_currency: 'EUR',
      single_phase: false,
    });
    expect(res.body.status).toBe('PENDING');
    return res.body;
  });

  await test.step('Checkout capture €1850', async () => {
    const res = await awx.capture(preAuth.transaction_id, 1850.0);
    expect(res.body.status).toBe('APPROVED');
  });
});

// ── TC-082: Recurring / subscription charges ─────────────────────────────────
const SUBSCRIPTIONS = [
  { name: 'Netflix', merchant: MERCHANTS.netflix, amount: 17.99 },
  { name: 'Spotify', merchant: MERCHANTS.spotify, amount: 9.99 },
];

for (const { name, merchant, amount } of SUBSCRIPTIONS) {
  test(`TC-082 | Recurring ${name} charge is APPROVED`, async () => {
    const { body } = await awx.createTransaction({
      merchant_category_code: merchant.mcc,
      merchant_info: merchant.info,
      transaction_amount: amount,
      transaction_currency: 'EUR',
      single_phase: true,
    });

    expect(body.status).toBe('APPROVED');
  });
}

// ── TC-083: ATM cash withdrawal ──────────────────────────────────────────────
test('TC-083 | ATM cash withdrawal is created', async () => {
  const { status, body } = await awx.createTransaction({
    merchant_category_code: MERCHANTS.atm.mcc,
    merchant_info: MERCHANTS.atm.info,
    transaction_amount: 200.0,
    transaction_currency: 'EUR',
    single_phase: true,
  });

  expect(status).toBe(201);
  expect(body.transaction_id).toBeTruthy();
});

// ── TC-084: Refunds (full and partial) ───────────────────────────────────────
test('TC-084 | Full refund after clearing creates an ORIGINAL_CREDIT', async () => {
  const amount = 890.0;

  const original = await test.step('Original transaction €890', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.gucci.mcc,
      merchant_info: MERCHANTS.gucci.info,
      transaction_amount: amount,
      transaction_currency: 'EUR',
      single_phase: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    return res.body;
  });

  await test.step('Full refund €890', async () => {
    const res = await awx.refund(original.transaction_id, amount, 'EUR');
    expect(res.status).toBe(201);
    expect(res.body.transaction_type).toBe('ORIGINAL_CREDIT');
  });
});

test('TC-084 | Partial refund after clearing creates an ORIGINAL_CREDIT', async () => {
  const original = await test.step('Original transaction €610', async () => {
    const res = await awx.createTransaction({
      merchant_category_code: MERCHANTS.restaurant.mcc,
      merchant_info: MERCHANTS.restaurant.info,
      transaction_amount: 610.0,
      transaction_currency: 'EUR',
      single_phase: true,
    });
    expect(res.body.status).toBe('APPROVED');
    return res.body;
  });

  await test.step('Partial refund €200', async () => {
    const res = await awx.refund(original.transaction_id, 200.0, 'EUR');
    expect(res.status).toBe(201);
    expect(res.body.transaction_type).toBe('ORIGINAL_CREDIT');
  });
});
