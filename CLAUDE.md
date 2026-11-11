# NautZero E2E — Claude Code context

Playwright + TypeScript E2E tests for **NautZero** (`https://stg-dashboard.nautzero.com`),
Page Object Model.

## Stack & layout
- `tests/` — specs by module: `auth/`, `navigation/`, `cardholders/`, `cards/`, `fleet/`,
  `settings/`, `manual-ledger/`, `api/`, `setup/`
- `src/pages/` — Page Objects: `LoginPage`, `ManualLedgerPage` (+ `formatAmount`),
  `CashEntryWizard` (all manual-ledger wizard steps, no hard sleeps),
  `TransactionList` (row/details assertions), `CardholdersPage` (list, card actions,
  Add-a-Cardholder drawer)
- `src/helpers/` — `auth.helper` (login flow), `ui.helper` (listbox pickers,
  `fillMaskedInput`, `confirmDialog`, `enterOtp`, `closeRevealModal`,
  `getLoggedInUserName`), `navigation.helper`, `manual-ledger.helper` (balance reads),
  `airwallex.helper` (AWX simulation API client)
- `src/fixtures/test-data.ts` — THE single source of random test data (names, phones,
  emails, amounts, DOB, `todayParts()`, `uniqueText()`); never re-declare generators in specs
- `src/fixtures/users.ts` — users/credentials (lazy env reads; `USER_ROLES`, `authFile()`)
- `src/fixtures/test.ts` — THE suite's `test`/`expect`. Every spec imports from here, not
  from `@playwright/test`: it makes `goto`/`reload`/`waitForURL` wait for DOM-ready, because
  staging intermittently never fires `load` (that alone failed 13 tests in one run)
- `scripts/dom-audit.mjs` — read-only dump of the live accessibility tree for every screen
  and drawer the tests touch. Run it BEFORE writing or changing locators
- `playwright.config.ts` — one project per role, each with its own `storageState` (`.auth/*.json`)
- Credentials & OTP live in `.env` (git-ignored). Static staging OTP: `739712`

## The app drifts — verify against the DOM, not against comments
Staging changes without notice; comments and this file describe the app as it WAS. Before
touching a flow, run it and check `node scripts/dom-audit.mjs <outDir>`. The DOM-verified
facts (wizard step order, list filters, row contents per flow, form fields) live in
`.claude/skills/playwright-author/SKILL.md` — read it first, and update it when you find
a difference. Drift found in Nov 2026: Transfer wizard lost "Categorize Debit" and its
success screen; dialog aria-labels ≠ headings; boat form gained Currency + Billing
Frequency; admin creation gained two extra steps; reset-password lost its OTP step.

## Login & SCA
Some staging accounts are gated by an Airwallex hosted-SCA iframe ("Verify your identity"):
its passcode step accepts the static OTP, but the next step sends a REAL SMS and rejects
the static OTP, with limited attempts — NEVER brute-force it. `auth.helper` detects the
iframe and fails with a descriptive error. The accounts in `.env` are no-SCA test accounts;
if SCA shows up on one, stop and ask for a no-SCA account.

## Roles / projects
`yacht-admin`, `cardholder`, `yacht-admin-card` (admin who owns a card — currently the same
account as `yacht-admin`), `cardholder-physical`, `cardholder-virtual`,
`yacht-manager-admin`. Fleet + Settings specs run in one project
(`yacht-manager-admin-fleet`): boat currency is a per-boat form field and one Fleet holds
USD/EUR/GBP boats, so there are no separate USD/EUR accounts any more.

Each test project depends on its own `setup:<role>` project. `auth.setup.ts` tags each
login with `@setup-<role>`, and config `grep`s that tag (anchored with `$`) so running
one project logs in only that user.

## Conventions & hard-won lessons
- Prefer `getByRole` with `exact: true`. Confirm dialogs via `getByRole('heading')` + text,
  NOT `role="dialog"` — several modals/drawers don't expose that role.
- Many elements render twice (desktop/mobile) → strict-mode violations. Use `.first()` or
  `[role="alert"]:visible`.
- Department & DOB are custom listboxes (`getByRole('option')`). Pick department randomly
  from whatever options exist — never hardcode names.
- Formatted amount inputs drop the decimal point when typed → clear, `pressSequentially`,
  then `blur`. Compare persisted values via `toLocaleString('en-US')`.
- Cardholder rows: leading icon 31×25 = **physical**, 30×22 = **virtual**; first cell shows
  status (`Active`/`Frozen`/`Cancelled`). Cancelled/deleted cards render disabled action
  buttons (`aria-label="Freeze unavailable for this card"`) — filter by `isEnabled()`.
- **Replace** allowed once per 14 days. Virtual cards replace instantly (no form); physical
  cards show a shipping-address form + confirm step.
- Dashboard card widget: cardholders have no "My Card:" text — use "Available Cardholder
  Balance:" and the `Status:` value. PIN / View Card Details require the card to be **Active**
  (when Frozen, only Unfreeze is available; PIN button becomes "PIN unavailable while frozen").
- PIN & full card details render inside a **cross-origin Airwallex iframe**. Read via
  `page.frameLocator('iframe[src*="airwallex.com"][src*="/pin"]')` (plain page JS is blocked).
  "Data loaded" = digits appear inside the frame body.
- Freeze/Unfreeze success = toast "The card you have selected is now frozen." / "...active."

## Test data (cardholder creation)
Random names; valid UK mobile `+447xxxxxxxxx`; email `ov+<random>@carbonpay.io`; random
department; random DOB; amount 0.09–99999. Physical shipping: 15 Snape Hill, Dronfield,
Bradford, S18 2GH. OTU: balance 1–5000, Card ID = random Warcraft hero name.
Cardholder Balance max = $100,000 and must not exceed the account Remaining Balance.

## Status
- **Automated:** TC-001–TC-043, TC-064, TC-065
- **TODO:** TC-044/045 (replace already-deleted card), TC-046–048 (create admins / yacht),
  TC-049–055 (report downloads), TC-056–063 (Manual Ledger transactions)
- Test plan lives in `NautZero_TestCases.xlsx`

## Git
Direct push to `main` is blocked (branch protection). Work on a feature branch + PR.

## Running
```bash
npx playwright test                 # everything
npx playwright test --ui            # UI mode
npx playwright test --project=<role>
npx playwright test -g "TC-0XX"
```
