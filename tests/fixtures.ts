import { test as base, expect } from "@playwright/test";
// Navigation/privacy tests must not depend on remote thumbnail availability.
// Player failure behavior is explicitly exercised in core.spec.ts.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(
      /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//,
      (route) => route.abort(),
    );
    await use(page);
  },
});
export { expect };
