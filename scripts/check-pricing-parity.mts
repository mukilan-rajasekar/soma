// check-pricing-parity.mts — the TS pricing mirror must agree with the Python engine.
//
// tools/serve/pricing.py is canonical and emits tools/serve/fixtures/pricing_cases.json
// (inputs AND outputs, regenerated with --cases). test_serve_pricing.py pins that the
// fixture matches the Python engine; this check pins that src/lib/pricing.ts, given the
// same inputs, produces byte-identical results after canonical JSON ordering. Between
// the two, neither implementation can drift without a red gate naming the other.
//
// Run: node --experimental-strip-types scripts/check-pricing-parity.mts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { quote } from "../src/lib/pricing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "tools", "serve", "fixtures", "pricing_cases.json");

/** JSON with recursively sorted object keys, so ordering differences are not diffs. */
function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

type Case = { spec: Parameters<typeof quote>[0]; quote: unknown };

const cases: Case[] = JSON.parse(readFileSync(fixturePath, "utf8"));
if (!Array.isArray(cases) || cases.length === 0) {
  console.error("  \x1b[31m✗\x1b[0m pricing_cases.json is empty — regenerate with pricing.py --cases");
  process.exit(1);
}

let failures = 0;
for (const [i, c] of cases.entries()) {
  const expected = canonical(c.quote);
  let actual: string;
  try {
    actual = canonical(quote(c.spec));
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m case ${i}: TS mirror threw: ${(err as Error).message}`);
    failures += 1;
    continue;
  }
  if (actual === expected) {
    console.log(`  \x1b[32m✓\x1b[0m case ${i} agrees (${canonical(c.spec).slice(0, 72)}…)`);
  } else {
    console.error(`  \x1b[31m✗\x1b[0m case ${i} drifted\n      py: ${expected}\n      ts: ${actual}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(
    `\n\x1b[31m✗ pricing parity failed (${failures})\x1b[0m — change pricing.py and pricing.ts together, then regenerate the fixture`,
  );
  process.exit(1);
}
console.log(`\n\x1b[32m✓ pricing parity holds across ${cases.length} cases\x1b[0m`);
