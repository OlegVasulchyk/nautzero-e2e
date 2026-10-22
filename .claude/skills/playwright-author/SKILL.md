---
name: playwright-author
description: >
  Write or update Playwright + TypeScript E2E tests for the NautZero app
  (stg-dashboard.nautzero.com), following this repo's hard-won conventions. Use whenever
  the task is to automate a test case, add a spec, fix a flaky/failing NautZero test, or
  extend Page Objects / fixtures. Enforces DOM-inspection-first, stable locators, and the
  app-specific patterns in CLAUDE.md so tests pass on the first run instead of after many
  selector-fix cycles.
---

# Authoring NautZero Playwright tests

Follow this to produce tests that match the app's real markup and this repo's style.
Always read CLAUDE.md first; it is the source of truth for conventions.

## Rule 0 - Inspect the real DOM before writing locators
Do NOT guess selectors. Before writing a new interaction, inspect the live markup (via the
browser tools against stg-dashboard.nautzero.com, logged in with the right role) to read
the actual accessible names, roles, dialog labels, and button states. Guessing is what
causes the "run -> fail -> fix selector" loops. One inspection beats five retries.

## Locator conventions
- Prefer getByRole with { exact: true }. Avoid substring matches that catch disabled
  variants like "Freeze unavailable for this card".
- Confirm dialogs via getByRole('heading', { name: '...' }) + the body text, NOT
  getByRole('dialog') - several NautZero modals/drawers do not expose that role.
- Elements render twice (desktop/mobile) -> strict-mode violations. Use .first() or a
  :visible locator like page.locator('[role="alert"]:visible', { hasText: '...' }).
- Custom listboxes use getByRole('option'). Department/DOB are custom dropdowns; pick
  department randomly from whatever options exist - never hardcode names.
- Formatted amount inputs drop the decimal when typed: click, fill(''), pressSequentially,
  then blur. Verify persisted values with Number(x).toLocaleString('en-US').

## App-specific behaviour to encode
- Card state drives availability. Read the row/widget "Status:" value. Active -> Freeze/PIN/
  View Card Details; Frozen -> only Unfreeze (PIN button becomes "PIN unavailable while
  frozen"). Normalize state first (unfreeze if frozen) before testing Active-only actions.
- Cardholder row card type: leading icon 31x25 = physical, 30x22 = virtual. Replace on a
  physical card opens a shipping-address form + confirm; virtual replaces instantly.
- Replace is locked for 14 days after a replacement - select a cardholder whose Replace is
  enabled (check isEnabled()), and skip cancelled/deleted cards (disabled action buttons).
- PIN / full card details render in a cross-origin Airwallex iframe. Read via
  page.frameLocator('iframe[src*="airwallex.com"][src*="/pin"]'); plain page JS is blocked.
  "Data loaded" = digits appear in the frame body.
- Freeze/Unfreeze success = toast "The card you have selected is now frozen." / "...active.".
- Some metrics (e.g. Remaining Balance) truncate on narrow viewports; widen the viewport in
  the test (test.use({ viewport })) before reading them.
- Backend card creation/replacement can take up to ~60s; use generous timeouts on those waits.

## Structure & conventions
- Page Object Model in src/pages/; shared login via src/helpers/auth.helper.ts.
- Auth: storageState per role in .auth/*.json; each test project depends only on its own
  setup:<role> project (grep by @setup-<role>$ tag in auth.setup.ts) so one project logs in
  one user. New role -> add to src/fixtures/users.ts, auth.setup.ts (tagged), config project,
  and .env.
- Name tests "TC-0XX | <describe>" and "TC-0XX | <action>" matching NautZero_TestCases.xlsx.
- Wrap logical phases in test.step() for a readable trace. Prefer web-first assertions
  (toBeVisible/toContainText) over waitForTimeout.
- Static staging OTP lives in fixtures (STAGING_OTP); 2FA uses six "Digit N of 6" inputs
  then a Submit (or Continue) button.

## Before finishing
- Run the new/changed spec for the right --project and confirm green.
- Keep tests state-independent (normalize starting state; do not assume Active/Frozen).
- If behaviour differs from CLAUDE.md, update CLAUDE.md in the same change.
