# WEEK-PLAN — crank it out (Day 2 → submit Day 11)

Today = **Thu Jul 17 (Day 2)**. On-time deadline = **Mon Jul 27, 8:00 PM PT**.
Submit **early, Sun Jul 26 (Day 11)**. Three founders, parallel tracks.

Owners: **M** = Mukilan (eng/pipeline) · **AY** = Aayaan (ML + full-stack) ·
**AR** = Aarya (data + GTM). "Crude" = a simulated/illustrative version that's
honestly labeled; "Real" = a held-out result we can defend.

Legend: ✅ done today · ◐ crude version OK for demo · 🎯 real result target

---

## Day 2 — Thu Jul 17 (today)
- ✅ Pipeline, honest validation harness, notebook cleanup, demo rebuilt (3 lanes +
  vision panel), ROADMAP.md, both pre-registrations, YC-APPLICATION.md draft, 8-slide
  pitch deck (`demo/pitch.html`). *(Already built this session.)*
- **M:** rent an A100-40GB (RunPod/Lambda) + request gated **LLaMA-3.2** access now
  (approval lags). Prove the verified `av` config on ONE clip; confirm preds scale.
- **AR:** pull **TVSum** (`tvsum_prep.py`) + pick 3–5 rights-clean **hero ad** clips.
- **AY:** stand up the **LIRIS-ACCEDE** affect data + skim `honest_corr_timeseries.py`
  so the affect test is ready to clone.
- **ALL — decide the LLMBDA question in writing** (is Soma the full-time company,
  a pivot, or separate?). This gates the whole application. Don't skip it.

## Day 3 — Fri Jul 18  *(the real number)*
- **M+AR:** batch TRIBE on 10–20 TVSum clips → run `honest_corr_timeseries.py`. 🎯
  **This is the headline result.** Fill `p = ___, n = ___` in the deck (slide 4) and
  the YC app — whatever it says, including a null.
- **AY:** clone the harness for affect → **crude** valence/arousal vs LIRIS-ACCEDE. ◐
  Label it hypothesis. Real result is a stretch; the crude arc + honest badge is enough
  for the demo.
- **AR:** write the customer-discovery DM; build a 30–40 buyer list; send batch 1.

## Day 4 — Sun Jul 19  *(demo hero clips)*
- **M:** run `batch_extract.py` on the hero ads → drop `arc_*.json` into `demo/arcs/`.
  Find 2–3 where the predicted dip lines up with an obvious weak moment — those are the
  on-stage clips.
- **AY:** wire the affect arcs into the real hero `arc.json` (crude, labeled). Polish
  the demo (`index.html`) on the hero clips.
- **AR:** customer-call script; book calls for Day 5.

## Day 5 — Mon Jul 20  *(talk to buyers)*
- **AR:** run 3–5 design-partner calls. Capture verbatim quotes, pricing reactions,
  anyone willing to be a design partner. (YC weights this most after team.)
- **M:** lock the validation result + the money/validation slide numbers.
- **AR:** outreach batch 2 + follow-ups.

## Day 6–7 — Tue/Wed Jul 21–22  *(demo + founder video)*
- **M+AY:** make the demo clean and screen-recordable; record a backup screen capture.
- **ALL:** record the ~1-min YC founder video — who you are, real ad in → arcs out, the
  ONE true validation sentence (from Day 3), the honest boundary. Clear > polished.
- **AR:** wrap customer discovery; tally "X calls, Y said Z, N design-partner leads."

## Day 8–9 — Thu/Fri Jul 23–24  *(write + sharpen)*
- **ALL:** finalize `YC-APPLICATION.md` — paste real p/n, real quotes, real bios, the
  resolved LLMBDA answer. Verify the TRIBE facts (name/version, Algonauts-2025 win,
  publication status — drop "peer-reviewed" if it's a preprint).
- **AY+AR:** finalize the deck (`pitch.html`); get outside eyes (any YC alum/founder).
- Cut every sentence that isn't literally true. Tighten the one-liner.

## Day 10 — Sat Jul 25  *(interview reps)*
- **ALL:** rehearse the 4 killer answers out loud (they're in `YC-APPLICATION.md`) +
  "what's your moat" + "why now". AY fields the ML/science questions.
- Final proofread; test every link, the demo, and the video.

## Day 11 — Sun Jul 26  *(submit early)*
- Read the whole application out loud once. Submit. Block late August for a possible
  interview (decisions by Aug 28).

---

## What's "crude/simulated" this week vs real
| Piece | This week | Later (roadmap) |
|-------|-----------|-----------------|
| Interest/attention arc | 🎯 **Real** held-out result vs TVSum (Day 3) | more videos, retention |
| Affect (valence/arousal) | ◐ crude arc, honestly labeled "hypothesis" | R1 real vs LIRIS-ACCEDE |
| Named emotions | greyed **Vision** panel only | R2–R4, earned |
| Demo | real precomputed hero clips | live async upload (hook exists) |
| Validation numbers | real where we have them, "illustrative" where not | fill as runs land |

## The 3 things that can sink the week (do them first)
1. **GPU + LLaMA access** — approval lags; request Day 2 morning.
2. **The LLMBDA answer** — YC funds one full-time thing; decide it Day 2.
3. **The Day-3 TVSum number** — the whole pitch's one real result. Protect that run.
