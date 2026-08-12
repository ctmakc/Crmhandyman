import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// .mts because the file is ESM and package.json has no "type": "module" — loaded as
// .ts, Vite warns about it on every run. ESM has no __dirname.
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two suites under one `npm run test`.
 *
 * `unit` — pure logic out of `src/lib`, no Prisma, no Next runtime.
 * `e2e`  — the real application over HTTP: `tests/e2e/harness/global-setup.ts` boots a
 *          server on a throwaway database, and the tests drive it with real NextAuth
 *          sessions. It is a separate project so the unit suite never pays for a boot.
 *
 * TZ is pinned because the money code compares calendar days, and half of what these
 * tests guard (the DST cases in invoice-state) only exists in a zone that shifts.
 * UTC would make those assertions pass for the wrong reason.
 */
const shared = {
  environment: "node" as const,
  env: { TZ: "America/Toronto" },
};

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(here, "src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { ...shared, name: "unit", include: ["tests/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          ...shared,
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          globalSetup: ["tests/e2e/harness/global-setup.ts"],
          // One server, one database: the two e2e files must not interleave against it.
          fileParallelism: false,
          testTimeout: 60_000,
          // The first request into a dev server compiles the route it hits.
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
