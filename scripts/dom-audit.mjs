// ─────────────────────────────────────────────────────────────────────────────
// DOM audit — dump the REAL accessibility tree of the pages/drawers the tests
// touch, so locators can be checked against the live app instead of guessed.
//
//   node scripts/dom-audit.mjs [outDir]          (default: ./dom-audit)
//
// Uses the saved sessions in .auth/<role>.json (run the setup:* projects
// first if they are missing/expired). READ-ONLY: it opens drawers and expands
// rows but never submits anything. Do not run it while a Playwright test run
// is in progress.
//
// Output: <outDir>/<role>/<name>.yml — one ARIA snapshot per screen, plus
// <outDir>/<role>/<name>.html-notes.txt for facts ARIA can't show (hidden
// desktop/mobile duplicates, dialog aria-labels, input attributes).
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const BASE_URL = process.env.BASE_URL ?? 'https://stg-dashboard.nautzero.com';
const OUT = process.argv[2] ?? 'dom-audit';

/** Facts the ARIA tree hides but locators depend on. */
async function htmlNotes(page) {
  return page.evaluate(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const lines = [];
    lines.push('## dialogs (aria-label vs heading inside)');
    for (const d of document.querySelectorAll('[role="dialog"], dialog, aside')) {
      const h = d.querySelector('h1,h2,h3');
      lines.push(`- <${d.tagName.toLowerCase()}> role=${d.getAttribute('role')} aria-label=${JSON.stringify(d.getAttribute('aria-label'))} visible=${vis(d)} heading=${JSON.stringify(h?.textContent?.trim() ?? null)}`);
    }
    lines.push('## banner <p> elements (visible flag) — getLoggedInUserName takes the last visible');
    for (const p of document.querySelectorAll('header p, [role="banner"] p')) {
      lines.push(`- visible=${vis(p)} text=${JSON.stringify(p.textContent?.trim())}`);
    }
    lines.push('## inputs');
    for (const i of document.querySelectorAll('input, textarea')) {
      if (!vis(i)) continue;
      const id = i.getAttribute('id');
      const label = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : null;
      lines.push(`- type=${i.getAttribute('type')} id=${id} aria-label=${JSON.stringify(i.getAttribute('aria-label'))} placeholder=${JSON.stringify(i.getAttribute('placeholder'))} label=${JSON.stringify(label)}`);
    }
    lines.push('## duplicated visible/hidden texts (desktop+mobile render twice)');
    const seen = new Map();
    for (const b of document.querySelectorAll('button, a')) {
      const name = (b.getAttribute('aria-label') ?? b.textContent ?? '').trim();
      if (!name || name.length > 60) continue;
      const e = seen.get(name) ?? { visible: 0, hidden: 0 };
      vis(b) ? e.visible++ : e.hidden++;
      seen.set(name, e);
    }
    for (const [name, e] of seen) {
      if (e.visible + e.hidden > 1) lines.push(`- ${JSON.stringify(name)} visible=${e.visible} hidden=${e.hidden}`);
    }
    lines.push('## iframes');
    for (const f of document.querySelectorAll('iframe')) lines.push(`- src=${f.getAttribute('src')}`);
    return lines.join('\n');
  });
}

async function snap(page, role, name) {
  const dir = join(OUT, role);
  mkdirSync(dir, { recursive: true });
  // Let async widgets (balances, rows) render.
  await page.waitForTimeout(2500);
  const aria = await page.locator('body').ariaSnapshot().catch((e) => `ARIA SNAPSHOT FAILED: ${e}`);
  writeFileSync(join(dir, `${name}.yml`), `# ${page.url()}\n${aria}\n`);
  writeFileSync(join(dir, `${name}.html-notes.txt`), `# ${page.url()}\n${await htmlNotes(page)}\n`);
  console.log(`  ✓ ${role}/${name}`);
}

/** Run a step; a failure is recorded as a finding instead of aborting the audit. */
async function attempt(role, name, fn) {
  try {
    await fn();
  } catch (e) {
    const dir = join(OUT, role);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.FAILED.txt`), String(e));
    console.log(`  ✘ ${role}/${name}: ${String(e).split('\n')[0]}`);
  }
}

/** 'load' can hang on staging's long-polling requests — DOM-ready is enough here. */
const go = (page, url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

const closeDrawer = async (page) => {
  await page.getByRole('button', { name: 'Close drawer' }).first().click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(800);
};

// ── Per-role audits ───────────────────────────────────────────────────────────
const AUDITS = {
  'yacht-admin': async (page, role) => {
    await go(page, '/dashboard');
    await snap(page, role, 'dashboard');

    await go(page, '/accounts');
    await snap(page, role, 'accounts');

    await attempt(role, 'accounts-add-cash-entry', async () => {
      await page.getByRole('button', { name: 'Add Cash Entry' }).click();
      await snap(page, role, 'accounts-add-cash-entry-1-transaction-or-transfer');
      await page.getByRole('button', { name: 'Transaction', exact: true }).first().click();
      await snap(page, role, 'accounts-add-cash-entry-2-transaction-charter-or-boat');
      await closeDrawer(page);
    });

    await attempt(role, 'accounts-add-manual-entry', async () => {
      await page.getByRole('button', { name: 'Add Manual Entry' }).click();
      await snap(page, role, 'accounts-add-manual-entry-1-credit-or-paid-invoice');
      await page.getByRole('button', { name: 'Paid Invoice', exact: true }).first().click();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: /^(Boat|Operational)$/ }).first().click();
      await snap(page, role, 'accounts-add-manual-entry-3-paid-invoice-form');
      await closeDrawer(page);
    });

    await attempt(role, 'accounts-transaction-expanded', async () => {
      await page.getByRole('button', { name: 'Expand transaction details' }).first().click();
      await snap(page, role, 'accounts-transaction-expanded');
    });

    await go(page, '/cardholders');
    await snap(page, role, 'cardholders');

    await attempt(role, 'cardholders-row-expanded', async () => {
      await page.getByRole('button', { name: /Expand details for/ }).first().click();
      await snap(page, role, 'cardholders-row-expanded');
      await attempt(role, 'cardholders-edit-form', async () => {
        await page.getByRole('button', { name: 'Edit' }).first().click({ timeout: 5000 });
        await snap(page, role, 'cardholders-edit-form');
      });
    });

    await attempt(role, 'cardholders-add-drawer', async () => {
      await go(page, '/cardholders');
      await page.getByRole('button', { name: 'Add a Cardholder' }).click();
      await snap(page, role, 'cardholders-add-drawer-1-type');
      await page.getByRole('button', { name: 'Physical' }).click();
      await snap(page, role, 'cardholders-add-drawer-2-physical-form');
      await closeDrawer(page);
    });

    await attempt(role, 'cardholders-review-requests', async () => {
      await go(page, '/cardholders');
      await page.getByRole('button', { name: 'Review Requests' }).click({ timeout: 8000 });
      await snap(page, role, 'cardholders-review-requests');
    });

    await attempt(role, 'otu', async () => {
      await go(page, '/cardholders/one-time-use-cards');
      await snap(page, role, 'otu');
      await page.getByRole('button', { name: 'Add a One-Time-Use Card' }).click();
      await snap(page, role, 'otu-add-drawer');
    });
  },

  'yacht-admin-card': async (page, role) => {
    await go(page, '/dashboard');
    await snap(page, role, 'dashboard');
  },

  'cardholder': async (page, role) => {
    await go(page, '/dashboard');
    await snap(page, role, 'dashboard');
    await attempt(role, 'request-funds', async () => {
      await page.getByRole('button', { name: 'Request Additional Funds' }).click({ timeout: 8000 });
      await snap(page, role, 'dashboard-request-funds');
    });
  },

  'cardholder-physical': async (page, role) => {
    await go(page, '/dashboard');
    await snap(page, role, 'dashboard');
  },

  'cardholder-virtual': async (page, role) => {
    await go(page, '/dashboard');
    await snap(page, role, 'dashboard');
  },

  'yacht-manager-admin': async (page, role) => {
    await go(page, '/fleet');
    await snap(page, role, 'fleet');
    await attempt(role, 'fleet-add-boat', async () => {
      await page.getByRole('button', { name: 'Add a New Boat' }).click({ timeout: 8000 });
      await snap(page, role, 'fleet-add-boat');
      await closeDrawer(page);
    });
    await go(page, '/settings/admins');
    await snap(page, role, 'settings-admins');
    await attempt(role, 'settings-admins-add', async () => {
      await page.getByRole('button', { name: 'Add an Administrator' }).click({ timeout: 8000 });
      await snap(page, role, 'settings-admins-add');
    });
  },

  'yacht-manager-admin-eur': async (page, role) => {
    await go(page, '/fleet');
    await snap(page, role, 'fleet');
    await go(page, '/settings/admins');
    await snap(page, role, 'settings-admins');
  },
};

const browser = await chromium.launch();
for (const [role, audit] of Object.entries(AUDITS)) {
  const state = `.auth/${role}.json`;
  if (!existsSync(state)) {
    console.log(`- ${role}: no ${state}, skipped`);
    continue;
  }
  console.log(`${role}`);
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: state,
    viewport: { width: 1440, height: 900 }, // same as the test projects
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await audit(page, role);
  } catch (e) {
    console.log(`  ✘ ${role}: ${String(e).split('\n')[0]}`);
  }
  await context.close();
}
await browser.close();
console.log(`\nSnapshots written to ${OUT}/`);
