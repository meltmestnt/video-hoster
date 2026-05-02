import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Don't pick up compiled copies of test files. `pnpm build` (nest
    // build) drops `dist/**/*.test.js`, which would otherwise be
    // double-discovered as CommonJS test files and crash on
    // `require("vitest")`.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
