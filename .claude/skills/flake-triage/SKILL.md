---
name: flake-triage
description: >
  Diagnose a flaky or failing NautZero Playwright test from its trace, error, and video.
  Use when a test fails intermittently, the user shares a Playwright error/trace, or asks
  "why is this flaky / why did this fail". Classifies the root cause and proposes a concrete,
  stable fix aligned with this repo's conventions (CLAUDE.md), rather than just adding waits.
---

# Flake & failure triage

Find the real root cause of a Playwright failure and fix it properly. Never "fix" a flake by
blindly adding waitForTimeout or bumping timeouts without understanding why.

## Gather evidence first
- Read the full error: the failing assertion/action, the locator, and the call log.
- Open the trace: npx playwright show-trace (or the HTML report). Inspect the DOM snapshot at
  the failing step, the network panel, and console.
- Re-run narrowly to see if it reproduces: npx playwright test <file> -g "TC-0XX" --repeat-each=5
  (and --headed to watch). Use --last-failed to re-run only failures.

## Classify the root cause (common NautZero patterns)
1. Strict-mode violation (locator matched N elements) -> desktop/mobile duplicate render.
   Fix: .first() or a :visible locator; never loosen to a broader match.
2. Element "not visible / not enabled" -> wrong state. Card is Frozen/Cancelled (disabled
   buttons, "...unavailable..." aria-label) or data not loaded yet. Fix: normalize state
   first (status-based), or select an actionable row via isEnabled().
3. Dialog/heading not found -> used getByRole('dialog') where the modal lacks that role.
   Fix: assert via getByRole('heading') + body text.
4. Timeout waiting for value/toast -> transient toast already gone, or backend slow (card
   create/replace up to ~60s). Fix: assert the durable signal (heading disappears, status
   text), not the fleeting toast; raise only the specific wait.
5. Reading a truncated metric (e.g. Remaining Balance) -> narrow viewport truncates text.
   Fix: widen viewport (test.use({ viewport })) before reading.
6. Formatted input mismatch -> decimal dropped on type, or missing blur. Fix: fill(''),
   pressSequentially, blur; compare via toLocaleString('en-US').
7. Cross-origin iframe content "empty" -> read PIN/card data via page.frameLocator(...),
   not page JS.
8. Auth/setup failure -> stale or wrong storageState; confirm the per-role setup:<role>
   project ran and wrote .auth/<role>.json.
9. Order dependency / shared data -> a prior test mutated the record (froze/cancelled/replaced).
   Fix: make the test self-normalizing and pick its own actionable record.

## Output
State: the classified cause, the evidence that supports it (one line from the trace), and the
minimal stable fix as a diff or exact edit. Prefer determinism (correct locator, state
normalization, durable assertion) over longer timeouts. If genuinely a product bug, say so and
hand off to qa-artifacts to write a bug report instead of masking it in the test.
