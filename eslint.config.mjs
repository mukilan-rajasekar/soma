import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next. Listing any global ignore
  // replaces eslint's own defaults, so they have to be restated here —
  // otherwise a bare `npx eslint .` walks node_modules/ and .venv/.
  globalIgnores([
    // eslint's defaults:
    "**/node_modules/**",
    ".git/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This repo: the Python pipeline's virtualenv vendors JS we do not own.
    ".venv/**",
    "**/__pycache__/**",
  ]),
]);

export default eslintConfig;
