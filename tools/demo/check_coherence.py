#!/usr/bin/env python3
"""
check_coherence.py — the numbers on /demo agree with the artifacts they claim to come from.

WHY THIS EXISTS. Most figures on /demo are read from public/demo/report.json at render
time, so they cannot drift. A handful are NOT: they are hand-kept literals in TypeScript
that were transcribed from a build of that report, because they are scenery around the
real numbers rather than the numbers themselves (the cull chart's 24 candidates, the
hairline that separates them, the predicted reorder that leave-one-shot-out cannot
measure). Those literals go stale SILENTLY. Retune WEIGHTS in build_report.py, re-run it,
and the generation board re-ranks itself correctly while the cull chart above it still
shows last week's scores crossing the line — a page disagreeing with itself, on camera,
with nothing failing to announce it.

This is the announcement. It is pure arithmetic over two committed JSON artifacts and two
committed TS files; no GPU, no network, no build. Run it from scripts/verify.sh.

Parsing TypeScript with regular expressions is normally a bad idea and is the right call
here: the three shapes below are literal arrays of integers with a fixed spelling, they
live in files this repo controls, and the alternative (a TS test runner, a parser
dependency) is more machinery than the whole check is worth. If a match count comes back
wrong the check FAILS rather than skipping — a guard that quietly stops guarding when the
source is reformatted is worse than no guard.

    .venv/bin/python tools/demo/check_coherence.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REPORT = os.path.join(ROOT, "public", "demo", "report.json")
PREFLIGHT = os.path.join(ROOT, "public", "preflight", "batch_report.json")
STUDIO = os.path.join(ROOT, "src", "components", "demo2", "studio.ts")
GENSTUDIO = os.path.join(ROOT, "src", "components", "demo2", "GenerateStudio.tsx")

failures: list[str] = []
notes: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    if ok:
        print(f"  \033[32m✓\033[0m {label}")
    else:
        print(f"  \033[31m✗\033[0m {label}" + (f"\n      {detail}" if detail else ""))
        failures.append(label)


def read(path: str) -> str:
    with open(path, encoding="utf8") as fh:
        return fh.read()


def main() -> int:
    report = json.loads(read(REPORT))
    studio = read(STUDIO)
    gen = read(GENSTUDIO)

    # ── 1 · the cull chart is the same five candidates as the board ──────────────
    #
    # LATTICE's `survives: true` entries are a hand-kept copy of the five campaign
    # variants' soma scores. The board below the chart sorts the REAL ads by their REAL
    # score, so if these disagree the page shows five scores crossing a pass line and
    # then five different scores on the cards those candidates supposedly became.
    print("\nstudio.ts LATTICE vs report.json campaign")
    lattice = [
        (int(s), flag == "true")
        for s, flag in re.findall(r"\{ score: (\d+), survives: (true|false) \}", studio)
    ]
    check(len(lattice) > 0, "LATTICE parsed", "regex matched nothing — has the array been reformatted?")
    if not lattice:
        return finish()

    survivors = sorted((s for s, v in lattice if v), reverse=True)
    rejected = sorted((s for s, v in lattice if not v), reverse=True)
    variants = sorted((v["scores"]["soma"] for v in report["campaign"]["variants"]), reverse=True)

    check(
        survivors == variants,
        "surviving candidates are the campaign's real scores",
        f"lattice {survivors} != report {variants} — re-derive the `survives: true` entries",
    )

    generated = re.search(r"export const GENERATED = (\d+)", studio)
    check(generated is not None, "GENERATED parsed")
    if generated:
        check(
            int(generated.group(1)) == len(lattice),
            f"GENERATED ({generated.group(1)}) is the length of LATTICE ({len(lattice)})",
            "the count the section counts up to must be the number of columns it draws",
        )

    # ── 2 · the pass line actually separates the two groups ─────────────────────
    print("\nGenerateStudio.tsx PASS_MARK")
    pm = re.search(r"const PASS_MARK = (\d+)", gen)
    check(pm is not None, "PASS_MARK parsed")
    if pm and survivors and rejected:
        mark = int(pm.group(1))
        check(
            rejected[0] < mark < survivors[-1],
            f"PASS_MARK ({mark}) separates best rejected ({rejected[0]}) from weakest survivor ({survivors[-1]})",
            "the hairline must be a boundary, not a decoration drawn near one",
        )

    # ── 3 · the applied edit stays a MEASURED one ───────────────────────────────
    #
    # studio.ts's own rule: "resting the section's punchline on the single option with no
    # measurement behind it is exactly the trade this page does not make." EDIT_APPLIED is
    # EDIT_OPTIONS[0], so option 0 must carry a shotIndex (measured) and no predicted
    # option may outscore it, or a retune could hand the win to an invented number.
    print("\nstudio.ts EDIT_OPTIONS")
    block = re.search(r"export const EDIT_OPTIONS: EditOption\[\] = \[(.*?)\n\];", studio, re.S)
    check(block is not None, "EDIT_OPTIONS parsed")
    if block:
        opts = re.findall(r"\{(.*?)\n  \}", block.group(1), re.S)
        check(len(opts) > 0, "EDIT_OPTIONS entries parsed")
        shots = report["campaign"]["shots"]

        def resolved(body: str) -> tuple[int, bool]:
            """Mirror studio.ts resolveOption(): a shotIndex reads the measured
            leave-one-shot-out score, anything else uses its declared prediction."""
            m = re.search(r"shotIndex: (\d+)", body)
            if m:
                return shots["shots"][int(m.group(1))]["without"], True
            sc = re.search(r"score: (\d+)", body)
            return (int(sc.group(1)) if sc else shots["base"]), False

        if opts:
            first_score, first_measured = resolved(opts[0])
            check(
                first_measured,
                "EDIT_APPLIED (EDIT_OPTIONS[0]) is a measured splice",
                "the applied winner must not be a `predicted: true` option",
            )
            best_predicted = max(
                (resolved(o)[0] for o in opts if not resolved(o)[1]), default=-1
            )
            check(
                best_predicted < first_score,
                f"no predicted option ({best_predicted}) outscores the applied splice ({first_score})",
                "a predicted number winning the ranking would make the payoff unmeasured",
            )
            notes.append(f"applied splice: {shots['base']} → {first_score}")

    # ── 4 · the two scorers agree about what a hook is worth ────────────────────
    #
    # /demo renders the PREFLIGHT artifact's hook weight in the hook beat ("worth 40% of
    # the total") and report.json's scores everywhere else. When those two weights differ
    # the page quotes one pipeline's percentage over the other pipeline's numbers, which
    # is how the site ended up saying 40% while computing 45%.
    print("\nhook weight agreement across pipelines")
    if not os.path.exists(PREFLIGHT):
        print("  \033[33m–\033[0m no preflight artifact — skipping (legitimately absent on a fresh clone)")
    else:
        pf = json.loads(read(PREFLIGHT))
        rw, pw = report["weights"]["hook"], pf["weights"]["hook"]
        check(
            abs(rw - pw) < 1e-9,
            f"report.json hook ({rw}) == batch_report.json hook ({pw})",
            "one page renders the preflight percentage over report.json's scores",
        )
        total = sum(report["weights"].values())
        check(abs(total - 1.0) < 1e-9, f"report.json weights sum to 1.0 ({total})")

    return finish()


def finish() -> int:
    for n in notes:
        print(f"\n  \033[2m{n}\033[0m")
    if failures:
        print(f"\n\033[31m✗ {len(failures)} coherence check(s) failed\033[0m")
        print("  These are hand-kept literals. Re-derive them from the artifact and re-run.")
        return 1
    print("\n\033[32m✓ demo artifacts and their hand-kept literals agree\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
