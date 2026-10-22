---
name: qa-artifacts
description: >
  Write QA artifacts for NautZero from the user's descriptions: bug reports, test plans,
  and detailed test cases. Use when the user describes a defect ("found a bug where...",
  "write a bug report"), asks for a test plan, or wants formal test cases from a feature
  description or a coverage checklist. Keeps TC numbering and format consistent with
  NautZero_TestCases.xlsx.
---

# QA artifacts: bug reports, test plans, test cases

Produce clear, consistent, reviewable QA documents. Match the existing NautZero format and
numbering. Ask for the missing essentials (steps, expected, environment, role) rather than
inventing them.

## Shared context
- App: NautZero, staging https://stg-dashboard.nautzero.com. Roles: yacht-admin, cardholder,
  yacht-manager-admin (and card-owning variants).
- The master test list is NautZero_TestCases.xlsx with columns: TC_ID, Module, Test Name,
  User Role(s), Priority, Preconditions, Test Steps, Expected Result, Playwright Notes, Status.
- TC IDs are sequential "TC-0XX". Before assigning new IDs, check the highest existing ID so
  numbering does not collide, and keep code + sheet in sync.

## Bug report format
Title: concise, "[Area] <what fails> when <condition>".
Then:
- Environment: URL/stg, role/account, browser, date.
- Preconditions: state needed to reproduce.
- Steps to reproduce: numbered, minimal, deterministic.
- Expected result.
- Actual result (what really happens, with exact error text if any).
- Severity (Blocker/Critical/Major/Minor) and Priority (High/Medium/Low) - state both and
  why.
- Evidence: screenshot/trace/console/network note where relevant.
- Notes: frequency (always/intermittent), affected roles, suspected scope.
Keep it reproducible by someone who has never seen it. No speculation presented as fact.

## Test case format (matches the xlsx)
For each case provide: TC_ID, Module, Test Name, User Role(s), Priority, Preconditions,
Test Steps (numbered), Expected Result, Playwright Notes (selectors/locators strategy and
app quirks from CLAUDE.md), Status (default "Not Started" / "Automated").
Write positives and negatives as separate cases. Make expected results assert specific,
observable outcomes (exact toast/error text, status change, URL), not vague "works".

## Test plan format
- Scope: feature/area, what is in and out of scope.
- Roles & environments covered.
- Test matrix: cases grouped by module with priority.
- Risks & assumptions, data needed, entry/exit criteria.
- Link to the relevant TC range in NautZero_TestCases.xlsx.

## Working with the xlsx
When adding/updating cases in NautZero_TestCases.xlsx, use openpyxl, preserve existing
styles (only set cell .value), keep the Legend sheet intact, and report the TC range changed.
When the user approves, it is fine to also mark cases "Automated" once the matching spec exists.

## Hand-off
Formal cases produced here are the input to playwright-author for automation. If the source
is only a rough description, first consider running task-design-analysis to get a coverage
checklist, then turn High-priority items into cases here.
