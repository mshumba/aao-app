const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  // Build output, generated evidence and other worktrees: not the project's source.
  {
    ignores: [
      "dist/*",
      ".expo/*",
      "test-results/*",
      "playwright-report/*",
      "web-export/**",
      "artifacts/**",
      ".claude/**",
    ],
  },
]);
