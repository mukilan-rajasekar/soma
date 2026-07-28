import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { emptyBrief, normaliseAliases, validateBrief, type Brief } from "@/lib/batch";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.SOMA_PYTHON_BIN?.trim() || "python3";

export type GenerateRunInput = {
  brief: Brief;
  n: number;
  duration: number;
  aspect: "9:16" | "1:1" | "16:9";
  provider: string;
};

export function toGenerateBrief(input: unknown): Brief {
  const raw = (input ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? raw[k] : "");
  return {
    ...emptyBrief(),
    batch_name: str("batch_name"),
    brand_name: str("brand_name"),
    product_name: str("product_name"),
    primary_problem: str("primary_problem"),
    primary_benefit: str("primary_benefit"),
    offer: str("offer"),
    desired_cta: str("desired_cta"),
    platform: str("platform") || "meta",
    placement: str("placement") || "reels",
    objective: str("objective") || "conversions",
    audience: str("audience") || "beta",
    brand_aliases: normaliseAliases((raw.brand_aliases as string[] | string) ?? []),
    product_aliases: normaliseAliases((raw.product_aliases as string[] | string) ?? []),
  };
}

export function validateGenerateInput(input: {
  brief: Brief;
  n?: unknown;
  duration?: unknown;
  aspect?: unknown;
  provider?: unknown;
}) {
  const problems = validateBrief(input.brief);
  const n =
    typeof input.n === "number" && Number.isFinite(input.n)
      ? Math.max(1, Math.min(6, Math.floor(input.n)))
      : 6;
  const duration =
    typeof input.duration === "number" && Number.isFinite(input.duration)
      ? Math.max(6, Math.min(30, input.duration))
      : 15;
  const aspect =
    input.aspect === "9:16" || input.aspect === "1:1" || input.aspect === "16:9"
      ? input.aspect
      : "9:16";
  const provider =
    typeof input.provider === "string" && input.provider ? input.provider : "stub";
  return {
    problems,
    input: {
      brief: input.brief,
      n,
      duration,
      aspect,
      provider,
    } satisfies GenerateRunInput,
  };
}

export async function runGeneratePipeline(input: GenerateRunInput): Promise<Record<string, unknown>> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "soma-generate-"));
  const briefPath = path.join(tmpDir, "brief.json");
  const outDir = path.join(tmpDir, "out");

  try {
    await writeFile(briefPath, JSON.stringify(input.brief, null, 2), "utf8");

    const args = [
      "-m",
      "tools.generate.pipeline",
      "--brief",
      briefPath,
      "--out-dir",
      outDir,
      "--provider",
      input.provider,
      "--n",
      String(input.n),
      "--duration",
      String(input.duration),
      "--aspect",
      input.aspect,
      "--score",
    ];

    await execFileAsync(PYTHON, args, {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });

    const generatedPath = path.join(outDir, "generated.json");
    return JSON.parse(await readFile(generatedPath, "utf8")) as Record<string, unknown>;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
