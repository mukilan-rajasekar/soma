# Coding Conventions

**Analysis Date:** 2026-07-28

## Naming Patterns

**Files:**
- Component files: PascalCase (e.g., `BrainField.tsx`, `Landing.tsx`)
- Utility/library files: kebab-case or camelCase (e.g., `edit-runner.ts`, `arc.ts`, `upload-client.ts`)
- Test files: snake_case with `_test.py` suffix for Python (e.g., `test_honest_corr.py`, `head_null_test.py`)

**Functions & Variables:**
- camelCase for all function names and variables (e.g., `onSubmit`, `sanitizeName`, `buildStoragePath`, `looksLikeMp4`)
- Event handlers: prefix with "on" followed by PascalCase (e.g., `onSubmit`, `onUpload`)

**Types:**
- PascalCase for TypeScript types and interfaces (e.g., `AllowedMime`, `EditMessage`, `BatchEditOption`, `PreflightReport`)
- Use discriminated unions with `kind` field for type variants (e.g., `DemoEditRunInput`, `BatchEditRunInput`)

**Constants:**
- UPPER_SNAKE_CASE for all constants (e.g., `MAX_UPLOAD_BYTES`, `ALLOWED_MIME`, `ACCEPT_ATTR`, `EMAIL_PATTERN`)
- Constants are declared at module level and exported when used across modules
- Constants include inline comments explaining their purpose and derivation

## Code Style

**Formatting:**
- No explicit Prettier configuration file; follows default formatting conventions
- No tabs/spaces enforcer configured — consistency is manual
- Use 2-space indentation (inferred from codebase)
- Line wrapping follows project practices (seen in `BrainField.tsx` with long className chains)

**Linting:**
- ESLint with Next.js and TypeScript plugins via `eslint.config.mjs`
- Linting scope limited to `src/` directory during verification (`scripts/verify.sh`)
- Default ESLint ignores override with explicit global ignores: `node_modules`, `.git`, `.next`, `.venv`, `__pycache__`
- Run linting: `npm run lint` (bare eslint scanning current directory)

**TypeScript:**
- `strict` mode enabled in `tsconfig.json`
- Target: ES2017
- Module resolution: bundler (Next.js 16)
- Path aliases: `@/*` maps to `./src/*`
- `noEmit` enabled — type checking only, no code generation
- React JSX mode: `react-jsx` (automatic runtime, no `import React` needed)

## Import Organization

**Order (from top to bottom):**
1. Node.js built-in modules (prefix with `node:`, e.g., `import { execFile } from "node:child_process"`)
2. Third-party dependencies (e.g., `import React`, `import * as THREE`)
3. Type imports from other modules (using `import type`)
4. Relative imports from local source files

**Example from codebase:**
```typescript
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { PreflightAd, PreflightReport, Speech } from "@/components/preflight/types";
```

**Path Aliases:**
- Use `@/` prefix for imports from `src/` directory (enforced via `tsconfig.json`)
- Always use path aliases over relative paths (`import X from "@/lib/utils"` not `import X from "../../lib/utils"`)

**Type Imports:**
- Separate `import type` statements for types to enable tree-shaking
- Never mix type and value imports in the same statement

## Error Handling

**Patterns:**
- Use try-catch for async operations; catch block handles both Error and non-Error thrown values
- Return structured JSON responses with `{ error: "message" }` shape from API routes
- Use appropriate HTTP status codes (400 for validation, 500 for server errors)
- Graceful degradation: return empty lists/default values instead of throwing when external services are unavailable
- Example from `src/app/api/arcs/route.ts`: return empty array if Supabase is not configured, never expose 500 error

**Validation:**
- Regex patterns are defined as constants and reused (e.g., `EMAIL_PATTERN`, `STORAGE_PATH_PATTERN`)
- Early return pattern for validation failures (validate, then return error if invalid)
- Type guards to narrow types after validation (e.g., `isAllowedMime` function narrowing to `AllowedMime` type)

**HTTP Response:**
- Use `Response.json()` for returning JSON from API routes
- Successful responses: `{ ok: true }` or bare data object
- Error responses: `{ error: "User-facing message" }` with appropriate status code

## Logging

**Framework:** No formal logging framework detected; uses `console` when needed

**Patterns:**
- Python test files print structured output for CI visibility (e.g., `print(f"loaded {len(videos)} videos...")`)
- Use descriptive print statements with context (test name, results, counts)
- Print to stdout for success, stderr for errors (in shell scripts: redirect errors to stderr)

## Comments

**When to Comment:**
- Complex logic or non-obvious algorithms (seen extensively in `BrainField.tsx`)
- Important invariants and requirements (e.g., "MUST stay under queued/ (storage RLS)" in `upload.ts`)
- Security or correctness-critical decisions (e.g., explanation in `beta-gate.ts` about why it uses 404 instead of 401)
- Explain the WHY, not the WHAT — the code shows what, comments explain the reasoning

**JSDoc/TSDoc:**
- Functions receive inline comments above or within (not formal JSDoc)
- Example from `upload.ts`:
  ```typescript
  // True for a file the browser reports as MP4, or whose name ends in .mp4 when the
  // browser leaves the type blank (some OS/browser combos do). Lets the picker stay
  // forgiving without widening the accepted type.
  export function looksLikeMp4(name: string, type: string): boolean {
  ```

**Block Comments:**
- Use `// ──` divider comments to section complex code (seen in `BrainField.tsx`)
- Markdown-like headers with `// ─ TITLE ──────────────────` for major sections

## Function Design

**Size:** Prefer small, focused functions (50-100 lines typical)

**Parameters:**
- Named parameters over positional for clarity in public APIs
- Use type annotations for all parameters (TypeScript strict mode)
- Optional parameters at the end, use `?` suffix

**Return Values:**
- Type-annotated return values (TypeScript strict mode)
- Return narrowed types from type guards (e.g., `function isAllowedMime(): type is AllowedMime`)
- Return `null` or structured error objects rather than throwing for expected failures
- Return `NaN` instead of 0 for degenerate inputs in numerical functions (ensures upstream detection)

**Pure Functions:**
- Prefer pure functions (no side effects) for utility libraries
- Comment when a function has side effects or accesses globals
- Example: upload constants are marked "PURE and environment-agnostic" in comments

## Module Design

**Exports:**
- Named exports preferred over default exports (easier for tree-shaking and refactoring)
- Example: `export const MAX_UPLOAD_BYTES`, `export function sanitizeName(...)`
- Type exports separate from value exports (use `export type` or `import type`)

**"use client":**
- React components in `src/components/` use `"use client"` directive to opt into client rendering
- Place at top of file before imports

**"server-only":**
- Server utilities (e.g., database clients, credential access) use `import "server-only"` to prevent accidental client imports
- Example in `src/lib/edit-source.ts`

**Module Cohesion:**
- Keep related functionality together (e.g., upload validation in `src/lib/upload.ts`)
- Separate concerns by layer: `components/` for React, `lib/` for utilities, `app/api/` for endpoints

## Python Conventions

**Test Structure:**
- Module docstring at top explaining what's tested and why
- Module docstring includes USAGE instructions for running the test
- Import style: standard library first, then third-party, then relative

**Variable Naming:**
- snake_case for variables, functions, and module names
- UPPER_CASE for constants
- Prefix temporary/loop variables with underscores if unused (e.g., `for _ in range(10)`)

**Comments:**
- Explain invariants and assumptions in prose before code
- Reference line numbers or function names in comments for clarity
- Use comments to explain the PROOF or mathematical reasoning, not just the WHAT

---

*Convention analysis: 2026-07-28*
