---
name: task-design-analysis
description: >
  Analyze a QA task, ticket, user story, or Figma design for NautZero and produce a
  structured test-coverage checklist. Use when the user shares a feature description,
  a Figma link/frame, a ticket, or asks "what should we test here / make a checklist /
  analyze this design". Produces the checklist that feeds test-case writing and
  Playwright authoring; it does not write tests or final test cases itself.
---

# Task & Design Analysis -> Coverage Checklist

Goal: turn a vague task or a design into an explicit, reviewable checklist of what must
be tested, BEFORE any test case or Playwright code is written. This is the thinking step.

## When to use
- A new feature/ticket/user story to be tested.
- A Figma frame or link (figma.com/...) to analyze for coverage.
- The user asks to "analyze", "make a checklist", "what are the cases", "what to cover".

## Inputs to gather first
1. Read the task description fully. Note the actors (which roles: yacht-admin, cardholder,
   yacht-manager-admin, ...), the entry point (page/URL), and the success outcome.
2. If a Figma design is referenced, use the Figma MCP tools to pull the real design
   (get_design_context / get_screenshot / get_metadata) rather than guessing from the
   description. Extract: every field + its validation, every button/state, empty vs filled
   states, error states, and any responsive variants shown.
3. If it touches an existing area, skim the matching spec under tests/ and the patterns in
   CLAUDE.md so the checklist matches how the app actually behaves.

## Produce the checklist
Group items under these headings (drop a heading only if truly N/A):

- Happy path - the main success flow, step by step.
- Field-level validation - each input: required, format, min/max, boundaries (e.g. amount
  0.09-99999, Cardholder Balance <= 100000 and <= Remaining Balance).
- Negative cases - empty form, partial input, invalid values, over-limit, wrong
  credentials/OTP, duplicate, not-found.
- State-dependent behaviour - what differs by object state. For cards: Active vs Frozen vs
  Cancelled/Deleted (buttons enable/disable, PIN unavailable while frozen), physical vs
  virtual (virtual replace is instant, no address form), 14-day Replace lock.
- Roles / permissions - repeat relevant cases per role; note what each role can/cannot see.
- Cross-cutting - 2FA where required, success toasts, data in secure Airwallex iframe,
  navigation/redirects, confirmation dialogs.
- Responsive / duplicates - desktop vs mobile render (NautZero renders some elements twice,
  note where that matters), truncated values on narrow viewports.
- Accessibility - keyboard reachability, roles/labels, focus on modals (flag if in scope).

## Output format
A Markdown checklist with "- [ ]" items, each phrased as a testable assertion
("Submitting an over-limit balance shows '...must not exceed 100,000.00' and keeps the form open").
Tag each item with a suggested priority (High/Medium/Low) and the role it applies to.
End with an "Open questions" section for anything the description/design does not resolve.

## Hand-off
State clearly that the next step is: feed High-priority items into qa-artifacts to write
formal test cases, then playwright-author to automate them. Do not write test cases or code
in this skill; keep it to analysis + checklist.
