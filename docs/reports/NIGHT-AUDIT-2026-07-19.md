# 🌙 Night Audit — 2026-07-19

> **⚠️ SUPERSEDED IN PART (updated 2026-07-20).** This audit was written *before* the Jul-19
> afternoon run. Its claim that the ROI/attention test "has NOT run — the whole company" is now
> **stale**: the n=15 ROI run DID complete — the raw arc is NULL (pre-registered) but the trained
> head tracks human interest (median r≈0.20, combined p=0.0003) and, as of Jul 20, **survives an
> ffmpeg-baseline control** (partial r≈0.18, p=0.0005). Current truth lives in `FIRST-REAL-RUN.md`,
> `validation/`, and CLAUDE.md "Current state (Jul 20)". Read those first; treat the TODOs below as
> a checklist, not a status.

*Full-project state + prioritized TODO, written while you slept. Four parallel
agents mapped science / frontend / infra / YC-docs; every live-DB and deploy fact
below I verified myself against the running Supabase project and the deployed site.
Companion doc: `NIGHT-WORK-LOG.md` = what I actually changed & deployed overnight.*

---

## TL;DR — read this first (5 things)

1. **🔴 URGENT: your live waitlist is silently broken.** The security hardening
   half-shipped. The deployed site now calls the `join_waitlist` RPC (good) and the
   old direct-insert path is correctly blocked — but the **live copy of the RPC
   throws `42702`** (a column/variable name clash). Every "Request early access"
   fails and falls back to `localStorage` in the visitor's own browser, so **you
   never receive the signup** and the UI still says "thanks, you're on the list."
   **Fix = re-paste `supabase/schema.sql` into the Supabase SQL Editor (30 sec).**
   The corrected function is already in the file; the live DB has a stale copy.
   *(I can't run DDL from here — this one's yours, first thing.)*

2. **🟢 The first real TRIBE run landed — and it's honest.** Real brain data for 3
   TVSum clips. Global attention validation came back **NULL exactly as
   pre-registered** (global is the documented likely-null baseline — a control
   behaving correctly, *not* a failure). A real MATLAB-v7.3 `.mat` bug was caught &
   fixed. See `FIRST-REAL-RUN.md`.

3. **🎯 The one experiment the whole pitch rests on has NOT run: the ROI (DMN)
   test.** Last Colab run set no ROI mask, so only the null baseline ran. This is
   the #1 critical-path item and it's ~1 day behind. Everything downstream (deck
   numbers, the "n" answer, the founder video) waits on it. **~1 GPU session + a
   morning of analysis.** Inputs are already staged.

4. **🟡 Honesty regression in the demo UI.** A recent polish pass removed the
   per-lane evidence badges and made copy more confident ("2D affect — Shipping
   now"), so the console now presents an *unvalidated hypothesis* (activation →
   attention/affect) in result-grade language. This is diligence-critical for a
   company whose moat *is* honesty. **I fixed the worst of this overnight** (see
   Work Log) — review and keep/revert to taste.

5. **⏰ YC deadline: Mon Jul 27, 8:00 PM PT — 8 days out.** The application draft is
   strong and all 4 interview-killers are pre-answered; the gap is *empirical, not
   narrative* — the pitch is written around a validation result that doesn't exist
   yet (n=3, global-only, null). Spend the next 48h almost entirely on #3.

---

## 1. What's live & verified (I checked these against production)

| Thing | State |
|---|---|
| Site (`soma-jet-tau.vercel.app`) | ✅ live; deploys on `git push` (verified ~12s propagation) |
| CSP header | ✅ live, correctly pins the Supabase origin in `connect-src`/`media-src` |
| `arcs` table (live-arc loop) | ✅ works — public read OK; **0 rows** (the real arc isn't published to it yet; it's only a local static file) |
| `uploads` table + bucket (concierge) | ✅ works end-to-end — verified anon upload (200) + intake row (201), self-cleaned |
| `waitlist` RPC | 🔴 **broken live** (`42702`) — see TL;DR #1. Direct insert correctly blocked (401). ~2 rows (likely old `deploy-check` test rows). |
| Deployed `supabase.js` | ✅ matches repo (uses the RPC) |
| Real pipeline outputs on disk | ✅ `data/arcs/preds_*.npy` (3 real clips), `validation/results.csv`, `report.html` |

---

## 2. The science: precise evidence ladder (nothing inflated)

| Claim | Status | Evidence |
|---|---|---|
| video → brain activation (Meta's TRIBE) | ✅ **VALIDATED** (not ours) | real preds landed, signed BOLD confirmed (43% negative), fsaverage5/20484 |
| attention arc vs TVSum — **global** | **NULL, as pre-registered** | 3 clips, combined Stouffer p ≈ 0.66; global = documented likely-null baseline |
| attention arc vs TVSum — **ROI (DMN)** | 🎯 **NOT RUN — the whole company** | zero `roi_mag` in any real arc; no ROI mask was set in Colab |
| affect (valence/arousal) | 🔴 **HYPOTHESIS** | hard-stamped `proxy-hypothesis`; not run on real clips; no LIRIS data |
| retention (the goal) | **NOT RUN** | no data source (Imran left); Roadmap Rung 2, proprietary flywheel |
| `train_head.py` learned head | **RAN → NULL (n=3, expected)** | plumbing de-risked only; real value comes with ROI features + n≥15 |

**#1 science TODO (critical path):** extract 15–50 TVSum clips **with `ROI_MASK_PATH`
set** (Colab Path B) → `make ingest` + `make head`. Inputs staged: `data/clips_trimmed/`,
`data/roi_mask_dmn.npy`, `data/ydata-tvsum50.mat`. A null is still a legitimate,
publishable pre-registered outcome — decide the "if it's null, here's the pitch"
framing *before* the run (`FIRST-REAL-RUN.md` has the honest fallback).

**Before quoting any surviving result** — resolve the open stats calls in
`OPTIMIZATION-BACKLOG.md` (#6/#9/#10): designate ROI as the single primary test +
apply a Holm correction across the ~5 tests + one effect-size floor. Otherwise the
ROI result becomes a "best-of-5" overclaim — the exact trap the old fabricated
"Hook/Pulse" numbers fell into.

---

## 3. Master TODO to Jul 27 (prioritized, critical path marked ⭐)

| # | Task | Effort | Owner-ish |
|---|---|---|---|
| 0 | 🔴 **Re-run `supabase/schema.sql`** to fix the live waitlist RPC | 30 sec | you, now |
| 1 | ⭐ **Run the real ROI validation** (15–50 clips, ROI mask on) → the one number the pitch needs | 1 GPU session + a morning | you + team |
| 2 | ⭐ **Resolve open pre-registration stats** (primary test + Holm + effect floor) *before* #1's write-up | 1–2 hrs decision | you |
| 3 | ⭐ **Customer discovery** — 30–40 outreach, 3–5 calls; the only evidence for "who pays" | continuous | team |
| 4 | ⭐ **~1-min founder video** (depends on #1) | half-day | all |
| 5 | ⭐ **Finalize `YC-APPLICATION.md`** — paste real n/p, real quotes, fill 2 bio blanks, verify TRIBE facts ("Algonauts-winning," not "peer-reviewed") | ~1 day | you |
| 6 | Deck (`pitch.html`) — fill numbers, soften "R0 live / R1 shipping" to the honesty ladder | half-day | parallel |
| 7 | Brand scrub — kill residual "SomAI"/"NEURACAST"; lock a real domain before the video | 1–2 hrs | parallel |
| 8 | Proactively disclose the **CC-BY-NC** (non-commercial TRIBE license) in the app + open the Meta commercial-license convo | 1 hr | parallel |
| 9 | Lock **who is CEO / owns the application** (docs imply you, never state it) | — | you |

**Critical-path bottleneck is #1.** It's a day late and has one known failure mode
(ROI mask silently skipped) that just cost the last run — now defaulted &
existence-checked in the notebook, so it can't silently repeat.

---

## 4. Demo / frontend backlog (this is also my overnight worklist)

Ranked by value. Items I did overnight are checked in `NIGHT-WORK-LOG.md`.

1. **Restore evidence badges on the console lanes** — attention = amber "predicted ·
   validating", affect = red "hypothesis". Closes the one place a hypothesis reads
   as a result. *(done overnight)*
2. **First paint shows 2 empty lanes** — default card is the affect-less real arc, so
   Valence/Arousal render a bare "no affect data". Made the empty state honest &
   intentional instead of broken-looking. *(done overnight)*
3. **Soften roadmap overclaim** — "2D affect — Shipping now" contradicts affect being
   a red hypothesis everywhere else. *(done overnight)*
4. **Trim dead assets** — `assets/fs5_*.bin` (~819 KB, never loaded) + `vendor/gsap`
   (116 KB, never referenced). Smaller bundle, fewer "what's this?" questions. *(done overnight)*
5. **fsaverage5 vs fs6 wording** — the console chip calls a hand-drawn silhouette an
   "fsaverage5 surface"; the 3D hero comments say fsaverage5 but load fs6. Reconciled. *(done overnight)*
6. **Stale `demo/README.md`** — documents an upload stub, a "cached-result" chip, and a
   `?arc=` param that no longer exist. Rewrite to match reality. *(pending — flagged)*
7. **`results.example.json` dead contract** — claims "app.js fetches results.json"; it
   doesn't. Either wire a real validation strip (once #1 gives a number) or drop the claim. *(pending)*
8. `pitch.html` is orphaned (no link in) — **left as-is on purpose**: it's the YC/$500K
   deck; probably shouldn't be one click from a prospect demo. Your call.

---

## 5. Infra / security follow-ups (post-fix)

- **Make waitlist failures non-silent** — `waitlist.html` swallows RPC errors and still
  shows success. At minimum log the error so a schema↔frontend drift is visible.
- **Deploy provenance** — CLI deploys leave no git SHA, so "what's live" isn't auditable
  from the repo. Prefer push-to-deploy (it works) or stamp the commit into the page.
- **Post-YC:** externalize inline scripts/styles → drop `'unsafe-inline'` from the CSP
  (last XSS gap). Add a signed-upload edge function + rate-limit (MIME allowlist is
  client-spoofable). Broaden the pre-push secret grep beyond `sb_secret_`.

---

## 6. Strategic decisions only you can make

1. **If the ROI arc returns null**, what's the pitch? (Decide the framing before the run.)
2. **How much n before Jul 27** — 15 vs 50 clips — and run the affect/LIRIS test this
   week, or leave affect as the explicitly-hypothesis demo layer?
3. **Trimodal (fight for gated LLaMA-3.2) vs ship the verified audio+video config** —
   fighting the gate risks the critical-path run.
4. **Submit early Sun Jul 26 vs use every hour to Mon 8 PM** for a stronger number.

**Bottom line:** the machine works, the story is coherent and unusually honest, and
the code is in good shape. The company is one clean ROI GPU run away from having its
first real evidence. Everything else is downstream of that.
