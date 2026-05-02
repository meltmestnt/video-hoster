import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Next.js's "this file is server-only" guard is a runtime no-op
      // package shipped by Next itself. In tests we run plain Node, so
      // alias it to an empty stub — we only care that the modules
      // gating on it can be imported and exercised, not that the
      // boundary is enforced under vitest.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      // Match the Next.js-style `@/` alias used throughout the app so
      // tests can import via the same paths as production code.
      "@": path.resolve(__dirname, "."),
    },
  },
});
