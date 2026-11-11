import { test as setup } from '../../src/fixtures/test';
import { login } from '../../src/helpers/auth.helper';
import { USERS, USER_ROLES, authFile } from '../../src/fixtures/users';

/**
 * Auth setup — one login per role, saving browser storage state to .auth/*.json.
 * Each setup carries a unique @tag so the config can depend on just the role it
 * needs (see the per-role `setup:*` projects in playwright.config.ts, which
 * grep these tags anchored with `$`). Running a single test project therefore
 * logs in only that project's user.
 */
for (const role of USER_ROLES) {
  setup(`authenticate as ${role} @setup-${role}`, async ({ page }) => {
    await login(page, USERS[role]);
    await page.context().storageState({ path: authFile(role) });
  });
}
