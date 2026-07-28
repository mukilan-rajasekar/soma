import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.SOMA_PYTHON_BIN?.trim() || "python3";

export type EditRunInput = {
  ad: string;
  top: number;
};

export function validateEditInput(input: {
  ad?: unknown;
  top?: unknown;
}) {
  const ad = typeof input.ad === "string" && input.ad ? input.ad : "";
  const top =
    typeof input.top === "number" && Number.isFinite(input.top)
      ? Math.max(1, Math.min(5, Math.floor(input.top)))
      : 3;
  return { ad, top };
}

export async function runEditSearch(input: EditRunInput): Promise<Record<string, unknown>> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "soma-edit-"));
  const jsonPath = path.join(tmpDir, "edits.json");

  try {
    const args = [
      "-m",
      "tools.edit.search",
      "--ad",
      input.ad,
      "--out-dir",
      tmpDir,
      "--top",
      String(input.top),
      "--json",
      jsonPath,
      "--verify",
    ];

    await execFileAsync(PYTHON, args, {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });

    return JSON.parse(await readFile(jsonPath, "utf8")) as Record<string, unknown>;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
