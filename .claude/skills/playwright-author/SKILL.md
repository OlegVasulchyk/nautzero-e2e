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
Do NOT guess selectors, and do NOT trust comments/CLAUDE.md as a description of today's
app. Before writing or changing an interaction, read the live markup:

    node scripts/dom-audit.mjs <outDir>     # read-only; uses .auth/<role>.json sessions

It writes one ARIA snapshot per screen/drawer per role (`<role>/<screen>.yml`) plus
`*.html-notes.txt` with what ARIA hides (dialog aria-label vs heading, hidden desktop/mobile
duplicates, input ids/labels/placeholders, iframes). Compare every locator you touch against
it. If your screen is not covered, ADD it to the script (open the drawer, snapshot, close)
instead of guessing - select an option rather than pressing Escape to close a dropdown:
Escape closes the WHOLE drawer. Dashboards need ~10s before data replaces the skeleton
(empty paragraphs, disabled buttons) - wait for a value, not just a label.
For one-off questions ("what does search match?", "what are this dropdown's options?")
write a 20-line throwaway node script with the same session and print the answer; delete it
after. One inspection beats five run-fail-fix cycles (a full run costs ~30 min and creates
real staging data).

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

## Verify, don't trust: the app changes under the tests
Staging changes without notice. In Nov 2026 a "refactor only" pass found the suite red for
reasons that had nothing to do with the code: a wizard step had been removed, a success
screen dropped, dialog aria-labels renamed, the header banner restructured, and login gated
by SCA. Comments and CLAUDE.md describe the app AS IT WAS when they were written.
- Before refactoring a flow, RUN it first on the untouched code. A test that is already red
  is an app-drift problem — fix that with DOM inspection, not by re-reading old comments.
- When a step "times out waiting for heading X", open the page snapshot in the failure's
  error-context.md: it shows which screen the app is REALLY on (that is how the removed
  Categorize step was found — the drawer was sitting on "Add a Note").
- Playwright wipes test-results/ on every run. Pass --output=<scratch dir> and redirect the
  full log to a file when you will need the artifacts; never pipe a long run through `tail`.
- Never run two Playwright processes at once (shared report dir, shared .auth sessions), and
  never run setup:* while another run is using .auth/*.json.

## Manual Ledger wizard — DOM-verified facts (Nov 2026)
Use src/pages/CashEntryWizard.ts; do not re-implement steps in specs.
- Dialog aria-labels do NOT equal the step headings ("Transaction or Transfer" lives in
  dialog "Select transaction or transfer"; "Debit Summary" in "Review debit details").
  Find a step's dialog by the heading INSIDE it (wizard.dialog(heading)), never by name.
- Choice buttons repeat a word from the heading (heading contains a <span>Transfer</span>):
  use getByRole('button', { name, exact: true }).first().
- Step order, cash TRANSFER (Add Cash Entry -> Transfer, or a Department card click which
  starts at "Debit or Credit"): Debit/Credit -> Charter or Boat [-> Choose the Charter] ->
  Details (Account dropdown; skipped for a Department card) -> Amount -> Transaction Date ->
  [Debit only: Add a Note] -> Summary. There is NO "Categorize Debit" step in transfers.
- Step order, cash TRANSACTION: Charter or Boat -> Debit Details (Supplier Name) -> Date ->
  Amount -> Categorize Debit -> Upload Your Receipt -> Add a Note -> Summary.
- Debit "Account" dropdown lists sub-accounts only; the Credit one starts with "Main Cash
  Account" (index 0), sub-accounts from index 1.
- Insufficient funds is reported INLINE on the Amount step (role=alert "This sub-account
  does not have enough funds to support this debit transfer.") and blocks Next — it is not
  a submit-time error. Debit tests need a funded sub-account: credit specs run first.
- After Submit the button reads "Submitting…". Transfer flows have NO success screen: the
  balances update live and the drawer closes by itself ~15-30s later. Use
  wizard.submitAndWaitDone() (accepts a success screen OR the drawer closing) and then
  assert the real outcome: polled balance delta + the transaction row.
- "SUCCESS" is uppercase only via CSS. getByText('SUCCESS') (string) is case-insensitive and
  matches; a /SUCCESS/ regex is case-sensitive and does NOT. Use /success/i.
- Dropdown triggers can swallow the first click while the drawer is still settling (seen
  live on Day/Month and Active Charters): the listbox simply does not open. Use
  selectOptionByIndex()/selectFirstOption() from ui.helper, which re-click until options show.
- Decimal amounts ARE accepted by the wizard amount inputs via fillMaskedInput; unique
  amounts with cents are how a test finds its own row among generic account names.
- Summary dates are "MM-DD-YYYY" (todayParts().formatted).

## Manual Transactions list - DOM-verified facts (Nov 2026)
Use src/pages/TransactionList.ts.
- Structure: region "Manual transactions" > table > one region per day ("Manual
  transactions for DD/MM/YYYY") > article per transaction > row > cells
  [Merchant, Amount, Status, Category, Subcategory, Receipt, Charter] + a button
  "Expand transaction details" (becomes "Collapse transaction details").
- The list is paginated (10 rows/page, 100+ pages) and staging holds FUTURE-dated seed rows
  above today's entries: a row you just created is usually NOT on page 1. Always find it
  with transactions.locate(name, amount): Dates filter -> "Today, ..." -> Save, then Search.
- The Search box matches the Merchant/name column only - NOT amounts. Generic names
  (a sub-account, "Main Cash Account") match many rows, so also filter by the run-unique
  amount (randAmount with cents). A page.reload() resets both filters.
- Row content per flow:
    transfer CREDIT (to Main Cash Account or a sub-account): amount "-$X", Category "N/A",
      Subcategory "N/A"; details label "Charter Name:", Description "Cash Credit Transfer"
    transfer DEBIT: amount "$X", Category = a "Select" button, Subcategory "—" (category is
      picked in the row, not the wizard); details label "Charter:", Description
      "Cash Debit Transfer"
    external Credit: amount "$X", Category "Select", Subcategory "—"
    Paid Invoice: amount "-$X", the chosen Category/Subcategory
  The Charter cell shows the charter name, or "Select" when unset (it reads "N/A" once the
  row is expanded) - assert it BEFORE expanding.
- Status cell text is "settled" in the DOM (capitalised by CSS).
- Header banner: the visible paragraphs are the date and the user name, but the name loads
  asynchronously and hidden mobile duplicates exist. Use getLoggedInUserName() (polls for a
  visible, non-date paragraph) - never banner.locator('p').nth(n).

## Other screens - DOM-verified facts (Nov 2026)
- Fleet "Add A New Boat": "Boat Currency" (USD/EUR/GBP) and "Billing Frequency"
  (Monthly/Annual) are required dropdown buttons, next to "Boat Type" (M/Y, S/Y) and "Boat
  Size". Currency is per boat; one Fleet holds boats of every currency (no separate USD/EUR
  accounts). Boat cards are articles with a "View N. <name>" button; use the "Search Boat
  Name" searchbox before asserting a new boat is listed.
- Fleet captain's phone: use randPhone() + fillMaskedInput. The Ofcom "drama" range
  (07700 900xxx) is rejected by the form ("Enter a valid mobile number.").
- Settings > Admins: page heading is "Settings" (h1) with "Administrators" (h2); the drawer
  is dialog "Add a new administrator" with labelled textboxes First Name / Last Name /
  Mobile Number / Email Address. Creation is THREE screens, each ending in "Submit":
  details -> "Would you like to enable this administrator to receive messages..." (switch)
  -> heading "Require Secondary Approval?" (switch) -> SUCCESS toast.
- Reset password: a valid phone leads to heading "Check Your Messages" with a "Return to
  login page" button - there is no OTP screen (/user/reset/<id>) in this flow any more. An
  incomplete phone shows the inline alert "*Please enter a valid mobile number."; an
  unknown phone shows alert "Error notification".
- Cardholder Edit form: some staging cardholders have an invalid stored email, which makes
  the form fail validation and blocks Save for ANY edit. CardholdersPage
  .openFirstCardholderEdit() repairs it; do the same if you open the form another way.
- TC-043 (balance > remaining balance) is only reachable while the account's Remaining
  Balance is under the $100,000 cap; otherwise it skips itself with that reason.
- Cardholders: "Add a Cardholder" -> dialog "Order A Cardholder" (Physical/Virtual) -> a
  dialog whose aria-label is "Order card details" but whose heading is "Physical Card" /
  "Virtual Card". Edit form inputs: aria-label "Cardholder Balance" and
  "Monthly Card Limit:". Expanded row actions: Edit, Freeze/Unfreeze, Replace, Cancel.
- Dashboard card widget: yacht admin shows heading "My Card: XXXX-XXXX-XXXX-1234";
  cardholders show "Available Cardholder Balance:" and a paragraph "Status: Active".
  Buttons: PIN (physical only), Freeze/Unfreeze, Replace, Cancel, View Card Details.
- Login: staging accounts may be gated by an Airwallex hosted-SCA iframe (real SMS, limited
  attempts - never brute-force). The accounts in .env are no-SCA test accounts; if a login
  suddenly shows "Verify your identity", stop and ask for a no-SCA account.

## Structure & conventions
- Import `test`/`expect` from src/fixtures/test (never from '@playwright/test'): its `page`
  waits for DOM-ready on goto/reload/waitForURL, because staging intermittently never fires
  `load`. A page you create yourself (browser.newContext().newPage()) must be wrapped with
  relaxNavigation(page) from the same module.
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
