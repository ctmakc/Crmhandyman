import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/exhaustive-deps": "warn",

      // React 19's compiler-oriented lint preset treats the existing client-side
      // fetch-on-mount screens and live clock/age readouts as compiler purity
      // violations. This application does not enable React Compiler. Keep the
      // runtime correctness rules (rules-of-hooks/exhaustive-deps) active while
      // we migrate those screens deliberately instead of rewriting working data
      // flows solely to satisfy compiler eligibility checks.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
