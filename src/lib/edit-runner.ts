import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { PreflightAd, PreflightReport, Speech } from "@/components/preflight/types";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.SOMA_PYTHON_BIN?.trim() || "python3";

type EditMessage = PreflightReport["batch"]["message"] | null;

// VERIFICATION IS OFF UNLESS ASKED FOR, and the default used to be the other way round.
//
// `--verify` re-scores the rendered cuts by re-entering demo/process_batch.py, which
// demo/README.md clocks at roughly four minutes for a SINGLE ad. execFileAsync below kills
// the child at three. So a run that requested verification could not finish by
// construction: the only reason the routes appeared to work is that on a machine without
// the TRIBE stack verify_batch fails fast and prints "verification did not run" instead of
// doing the work. Provision the stack and the same call starts timing out.
//
// Defaulting it off is also the honest default. `measured` is the difference between "we
// think this cut scores better" and "we ran the cut through the encoder and it does", and
// a flag that quietly claims the expensive one is the wrong way round. Verification is now
// something a caller asks for, on a host that can actually do it — see
// scripts/ingest_partner_ad.py, which runs it offline where there is no request timeout.
const VERIFY_BY_DEFAULT = false;

export type DemoEditRunInput = {
  kind: "demo";
  ad: string;
  top: number;
  verify?: boolean;
  estimateOnly?: boolean;
};

export type BatchEditRunInput = {
  kind: "batch";
  ad: string;
  top: number;
  verify?: boolean;
  estimateOnly?: boolean;
  sourceTitle: string;
  batchName: string;
  downloadUrl: string;
  durationS: number;
  arc: PreflightAd["arc"];
  lanes: PreflightAd["lanes"];
  features: PreflightAd["features"];
  transcript: Speech[];
  message: EditMessage;
};

export type EditRunInput = DemoEditRunInput | BatchEditRunInput;

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
    const args =
      input.kind === "demo"
        ? [
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
            ...(input.estimateOnly ? ["--estimate-only"] : []),
            ...((input.verify ?? VERIFY_BY_DEFAULT) ? ["--verify"] : []),
          ]
        : await buildBatchArgs(input, tmpDir, jsonPath);

    await execFileAsync(PYTHON, args, {
      cwd: process.cwd(),
      // Three minutes. A run that has not finished by then is wedged, not slow, and a
      // hung child holds the single run slot for everyone else until it is reaped.
      timeout: 3 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });

    return JSON.parse(await readFile(jsonPath, "utf8")) as Record<string, unknown>;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildBatchArgs(
  input: BatchEditRunInput,
  tmpDir: string,
  jsonPath: string,
): Promise<string[]> {
  const videoPath = path.join(tmpDir, `${input.ad}.mp4`);
  const adPath = path.join(tmpDir, "ad.json");

  const res = await fetch(input.downloadUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not fetch the source cut for this edit run.");
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(videoPath, bytes);

  await writeFile(
    adPath,
    JSON.stringify(
      {
        id: input.ad,
        title: input.sourceTitle,
        durationS: input.durationS,
        batchName: input.batchName,
        message: input.message,
        arc: input.arc,
        lanes: input.lanes,
        features: input.features,
        media: { transcript: input.transcript },
      },
      null,
      2,
    ),
    "utf8",
  );

  return [
    "-m",
    "tools.edit.search",
    "--ad-json",
    adPath,
    "--video",
    videoPath,
    "--out-dir",
    tmpDir,
    "--top",
    String(input.top),
    "--json",
    jsonPath,
    ...(input.estimateOnly ? ["--estimate-only"] : []),
    ...((input.verify ?? VERIFY_BY_DEFAULT) ? ["--verify"] : []),
  ];
}
