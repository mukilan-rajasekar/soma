#!/usr/bin/env python3
"""
make_report.py — turn the validation CSVs (+ forest plots) into ONE self-contained
HTML report you can hand a YC partner, an advisor, or a design partner.

It reports what the run actually found — including a null — with the method stamped
on every number. No cherry-picking, no fabricated wins. If the combined test is not
significant, the report says "NULL (as pre-registered)" in the same bold type a
positive result would get. That honesty is the point: a real reviewer trusts
"n=18, null, here's the method" far more than a suspiciously clean slam dunk.

INPUTS (all optional except --results):
  --results     validation/results.csv          (honest_corr_timeseries.py)
  --affect      validation/affect_results.csv    (affect_validate.py)
  --incremental incremental.csv                  (incremental_validity.py --out)
  forest PNGs next to the CSVs (results_forest.png, affect_results_forest.png) are
  embedded automatically as base64 if present.

OUTPUT:
  --out validation/report.html   (single file, no external assets, neon-on-black)

USAGE:
  python make_report.py --results validation/results.csv \
      --affect validation/affect_results.csv --incremental incremental.csv
"""
import argparse
import base64
import datetime
import html
import os

import numpy as np

from honest_corr_timeseries import _read_csv, stouffer, fisher


def _f(x, nd=3):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return "—"
    if np.isnan(v):
        return "—"
    return f"{v:.{nd}f}"


def _rows(cols):
    """dict-of-columns -> list of per-row dicts."""
    if not cols:
        return []
    keys = list(cols.keys())
    n = len(cols[keys[0]])
    return [{k: cols[k][i] for k in keys} for i in range(n)]


def _embed_png(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def _combined(rows, r_key="r", p_key="p"):
    rs, ps = [], []
    for r in rows:
        try:
            rr = float(r.get(r_key)); pp = float(r.get(p_key))
        except (TypeError, ValueError):
            continue
        if not (np.isnan(rr) or np.isnan(pp)):
            rs.append(rr); ps.append(pp)
    if not rs:
        return None
    _, ps_comb = stouffer(ps, rs)
    _, pf = fisher(ps)
    return {"n": len(rs), "median_r": float(np.nanmedian(rs)),
            "stouffer_p": ps_comb, "fisher_p": pf}


def _verdict_html(comb, alpha, label="signal tracks the human curve"):
    if comb is None:
        return '<span class="v null">no usable rows</span>'
    p = comb["stouffer_p"]
    is_null = p is None or np.isnan(p) or p >= alpha or abs(comb["median_r"]) < 0.05
    if is_null:
        return ('<span class="v null">NULL — as pre-registered</span> '
                f'<span class="sub">(combined p = {_f(p, 4)} ≥ {alpha})</span>')
    return (f'<span class="v ok">SIGNAL — {html.escape(label)}</span> '
            f'<span class="sub">(combined p = {_f(p, 4)} &lt; {alpha})</span>')


def _table(rows, spec):
    """spec = [(header, key, ndigits or None)]. Renders an HTML table."""
    head = "".join(f"<th>{html.escape(h)}</th>" for h, _, _ in spec)
    body = []
    for r in rows:
        tds = []
        for _, k, nd in spec:
            v = r.get(k, "")
            tds.append("<td>" + (html.escape(str(v)) if nd is None else _f(v, nd)) + "</td>")
        body.append("<tr>" + "".join(tds) + "</tr>")
    return f'<table><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


CSS = """
:root{--bg:#04060A;--panel:#0B0F16;--line:#1E2530;--ink:#EAF4FF;--dim:#94A2B3;
--faint:#586474;--neon:#7FD4FF;--ok:#3ED8A0;--hyp:#FF6B6B;--amber:#FFC44D;
--mono:'Space Mono',ui-monospace,monospace;--disp:'Space Grotesk',system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;
line-height:1.55;padding:40px 20px 70px}
.wrap{max-width:900px;margin:0 auto}
h1{font-family:var(--disp);font-weight:700;font-size:30px;letter-spacing:-.02em;margin-bottom:6px}
h1 .g{color:var(--neon);text-shadow:0 0 22px rgba(127,212,255,.4)}
.meta{font-family:var(--mono);font-size:11px;color:var(--faint);letter-spacing:.04em;margin-bottom:20px}
.banner{border:1px solid var(--line);border-left:3px solid var(--neon);border-radius:10px;
padding:14px 16px;background:rgba(127,212,255,.04);font-size:13.5px;color:var(--dim);margin-bottom:26px}
.banner b{color:var(--ink)}
section{border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:20px;background:var(--panel)}
h2{font-family:var(--disp);font-size:19px;font-weight:600;margin-bottom:4px}
.eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-bottom:10px}
.verdict{font-size:15px;margin:10px 0 14px}
.v{font-family:var(--mono);font-weight:700;padding:3px 9px;border-radius:6px}
.v.ok{color:var(--ok);border:1px solid rgba(62,216,160,.4);background:rgba(62,216,160,.08)}
.v.null{color:var(--hyp);border:1px solid rgba(255,107,107,.4);background:rgba(255,107,107,.08)}
.v.exp{color:var(--amber);border:1px solid rgba(255,196,77,.4);background:rgba(255,196,77,.08)}
.sub{font-family:var(--mono);font-size:12px;color:var(--dim)}
table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px;margin:8px 0}
th{text-align:right;color:var(--faint);font-weight:400;text-transform:uppercase;letter-spacing:.05em;
padding:6px 8px;border-bottom:1px solid var(--line);font-size:10px}
th:first-child,td:first-child{text-align:left}
td{padding:6px 8px;border-bottom:1px solid rgba(30,37,48,.5);color:var(--ink)}
img.forest{width:100%;border-radius:10px;margin-top:12px;background:#fff;border:1px solid var(--line)}
.method{font-family:var(--mono);font-size:11px;color:var(--faint);line-height:1.7;margin-top:8px}
footer{font-family:var(--mono);font-size:11px;color:var(--faint);text-align:center;margin-top:8px;line-height:1.8}
.missing{font-family:var(--mono);font-size:12px;color:var(--faint);font-style:italic}
"""


def build_html(args):
    out = []
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    out.append(f"<!doctype html><html lang=en><head><meta charset=utf-8>"
               f"<meta name=viewport content='width=device-width,initial-scale=1'>"
               f"<title>Soma — validation report</title><style>{CSS}</style></head><body><div class=wrap>")
    out.append('<h1>Soma <span class="g">validation report</span></h1>')
    out.append(f'<div class="meta">generated {stamp} · model = TRIBE v2 (public, '
               f'Algonauts-2025 winner) · null = circular-shift permutation · '
               f'n = timepoints within a video</div>')
    out.append('<div class="banner"><b>Read every row, including nulls.</b> These are the '
               'pre-registered outcomes of the within-video arc test. A NULL is a valid, '
               'reported result — not a failure to hide. "Global" (whole-cortex) is the '
               'documented likely-null baseline; "ROI" is the distinct open test.</div>')

    # ---- attention ----
    _, rc = _read_csv(args.results) if os.path.exists(args.results) else (None, None)
    out.append('<section><div class="eyebrow">Attention · predicted arc vs TVSum human interest</div>'
               '<h2>Does the predicted attention arc track real human interest?</h2>')
    if rc:
        rows = _rows(rc)
        for feat in ("roi", "global"):
            fr = [r for r in rows if str(r.get("feature")) == feat]
            if not fr:
                continue
            comb = _combined(fr)
            out.append(f'<div class="verdict"><b>{feat.upper()}</b> &nbsp; '
                       + _verdict_html(comb, args.alpha) + '</div>')
            out.append(_table(fr, [("video", "video", None), ("n", "n", None),
                                   ("r", "r", 2), ("perm p", "p", 3),
                                   ("ceiling", "ceiling", 2), ("r/ceil", "frac_of_ceiling", 2)]))
        forest = _embed_png(os.path.join(os.path.dirname(args.results), "results_forest.png"))
        if forest:
            out.append(f'<img class="forest" alt="attention forest plot" src="{forest}">')
    else:
        out.append('<p class="missing">No results.csv yet — run honest_corr_timeseries.py.</p>')
    out.append('</section>')

    # ---- affect (optional) ----
    if args.affect and os.path.exists(args.affect):
        _, ac = _read_csv(args.affect)
        rows = _rows(ac)
        out.append('<section><div class="eyebrow">Affect · proxy arc vs LIRIS-ACCEDE '
                   '(Rung 1)</div><h2>Does the proxy valence/arousal arc track human '
                   'affect?</h2>'
                   '<div class="verdict"><span class="v exp">EXPERIMENTAL — unvalidated '
                   'a-priori proxy</span> <span class="sub">a "tracks" row is a necessary '
                   'Rung-1 correlation, not a validated emotion decoder</span></div>')
        dim_key = "dim" if rows and "dim" in rows[0] else "dimension"
        for dim in ("valence", "arousal"):
            dr = [r for r in rows if str(r.get(dim_key)) == dim]
            if not dr:
                continue
            comb = _combined(dr)
            out.append(f'<div class="verdict"><b>{dim.upper()}</b> &nbsp; '
                       + _verdict_html(comb, args.alpha, "proxy tracks human affect dynamics")
                       + '</div>')
            out.append(_table(dr, [("video", "video", None), ("n", "n", None),
                                   ("r", "r", 2), ("perm p", "p", 3)]))
        forest = _embed_png(os.path.join(os.path.dirname(args.affect), "affect_results_forest.png"))
        if forest:
            out.append(f'<img class="forest" alt="affect forest plot" src="{forest}">')
        out.append('</section>')

    # ---- incremental (optional) ----
    if args.incremental and os.path.exists(args.incremental):
        _, ic = _read_csv(args.incremental)
        rows = _rows(ic)
        comb = _combined(rows, r_key="partial_r", p_key="perm_p")
        beats = comb is not None and comb["stouffer_p"] is not None \
            and not np.isnan(comb["stouffer_p"]) and comb["stouffer_p"] < args.alpha \
            and abs(comb["median_r"]) > 0.1
        vhtml = ('<span class="v ok">YES — beats the dumb baseline</span>' if beats
                 else '<span class="v null">NO — no lift over loudness/cuts/motion</span>')
        out.append('<section><div class="eyebrow">Incremental validity · "why not just '
                   'ffmpeg?"</div><h2>Does the brain arc add signal OVER a dumb '
                   'audiovisual baseline?</h2>'
                   f'<div class="verdict">{vhtml} <span class="sub">partial correlation, '
                   'controlling for loudness/cuts/luminance/motion</span></div>')
        out.append(_table(rows, [("video", "video", None), ("raw r", "raw_r", 2),
                                 ("partial r", "partial_r", 2), ("perm p", "perm_p", 3),
                                 ("adds signal", "adds_signal", None)]))
        out.append('</section>')

    out.append('<section><div class="eyebrow">Method</div>'
               '<p class="method">Both series are FIRST-DIFFERENCED (tests co-movement, '
               'not shared drift). The null CIRCULARLY SHIFTS one series, preserving its '
               'autocorrelation while destroying the cross-alignment — the honest p-value, '
               'floor 1/(M+1) over M distinct shifts. Combined p is a signed Stouffer over '
               'videos (Fisher as a cross-check); every video is reported (no best-of-N). '
               'The feature/ROI/aggregation were pre-registered before results were seen '
               '(PREREGISTRATION.md / PREREGISTRATION-affect.md).</p></section>')
    out.append('<footer>Soma (working name) · this report reflects the run as-is · '
               'predicted signal: TRIBE v2 (public weights) · attention ground-truth: '
               'TVSum · affect ground-truth: LIRIS-ACCEDE</footer>')
    out.append('</div></body></html>')
    return "".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--results", default="validation/results.csv")
    ap.add_argument("--affect", default=None)
    ap.add_argument("--incremental", default=None)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--out", default="validation/report.html")
    args = ap.parse_args()

    if not os.path.exists(args.results):
        raise SystemExit(f"No results at {args.results}. Run honest_corr_timeseries.py first.")
    doc = build_html(args)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        f.write(doc)
    print(f"[wrote] {args.out}  ({len(doc)//1024} KB, self-contained)")
    print("  Open it in a browser or hand it to a partner/advisor. Every number carries "
          "its method;\n  nulls are stamped honestly.")


if __name__ == "__main__":
    main()
