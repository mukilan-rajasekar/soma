# Content plan — the credibility layer (science / reading-guide / compare / FAQ)

*Build map for four new marketing surfaces, prompted by a competitor (VidCognition)
whose content playbook is good but whose epistemics we deliberately won't copy. See
`../COMPETITORS.md` for positioning; this doc is **how to build the pages**.*

**What this adds:** a public content layer Soma currently lacks. Today the site is
`index` (demo) + `waitlist` + `pitch`. A skeptical YC partner or design-partner
prospect who Googles "TRIBE v2" or "neural ad testing" during diligence finds
nothing from us. These four surfaces fix that — and out-credibility VidCognition's
own science page precisely *because* we label what's proven vs. hypothesis.

## The prime directive for all four pages

Match VidCognition's **production values**, never its **epistemics.** Every neural
claim on these pages wears its evidence tier (green validated / amber validating /
red hypothesis), same as the console. The moment a page states an
activation→engagement claim as fact, it's a VidCognition clone and we've lost the one
thing that makes us different.

---

## Shared architecture (applies to every new page)

- **Model each page on `waitlist.html`**, not `index.html`. Waitlist is the proven
  pattern for a *content* page: one self-contained HTML file with an **inline
  `<style>`** that redeclares the design tokens (`:root{--base…}`), the shared
  `nav`/`footer`, and a `prefers-reduced-motion` reset. No JS framework, no build
  step, no `styles.css` dependency (that file is console-specific). Auditable in
  DevTools — the honesty posture (`DESIGN.md` §"Why no build step").
- **Design tokens & bans:** pull verbatim from `DESIGN.md`. Reuse `.kick`, `h1
  .grad`, `.card`, `.chip`, evidence-badge patterns. Enforce the absolute bans
  (no gradient-clipped text, no side-stripe borders, no glassmorphism, no
  hero-metric template, no tracked-uppercase eyebrow scaffolding).
- **Evidence badge component** (lift from the console, make it a copy-paste snippet):
  ```html
  <span class="tier g">validated</span>   <!-- green  --ok   -->
  <span class="tier a">validating</span>  <!-- amber  --amber -->
  <span class="tier r">hypothesis</span>  <!-- red    --hyp   -->
  ```
  mono, `border + 8% tint` in the tier color, **always with a text label** (never
  color-only — WCAG + `PRODUCT.md` principle 1).
- **Nav:** same brand lockup as every page. Add the new pages to a shared nav set so
  all five surfaces cross-link (see "Navigation" below).
- **A11y:** WCAG 2.1 AA (`--dim`/`--faint` already tuned); visible ice focus rings;
  `aria-live` on any dynamic region; full reduced-motion path. Content pages are
  mostly static text, so this is cheap — don't regress it.
- **Routing:** Vercel serves `demo/` statically, so `demo/science.html` →
  `/science.html`. For clean URLs (`/science`, `/compare`, `/faq`) add `"cleanUrls":
  true` to `vercel.json` (verify it doesn't break existing `.html` links first) — or
  just link to the `.html` names. **No CSP change needed:** these pages fetch nothing
  external; if a page adds no inline `<script>`, it's even stricter than the current
  policy.
- **SEO (the actual point of these pages):** real `<title>`, `<meta description>`,
  OG/Twitter tags (copy the `index.html` block), semantic headings, and
  `FAQPage`/`Article` JSON-LD where it fits (see FAQ page). This is what makes us
  *findable* during diligence.

## Navigation (wire all five surfaces together)

Today: `index ↔ waitlist`, `pitch` standalone. After this work:

- Add a lightweight nav row (or footer link cluster) present on every page:
  `Demo · Science · Compare · FAQ · Request access`.
- `index.html` gets these links in the footer (keep the hero nav minimal — it fades
  at hero-top by design).
- Each new page's `nav` right-side links back to `index.html` ("← see the demo") and
  to `waitlist.html` ("Request early access →"), matching waitlist's pattern.
- Keep `pitch.html` unlinked from public nav (it's the founder deck, by design).

---

## Page 1 — `science.html`  (the education / breakdown page)  ·  route `/science`

**Job:** the deep, honest technical explainer. The page a skeptical technical
evaluator reads and leaves thinking *"this team is rigorous, not overclaiming."*
This is our answer to VidCognition's `/science` + blog post — same depth, opposite
epistemics.

**Primary audience:** YC partners, angels, technical design-partner leads mid-diligence.

**Section outline (top to bottom):**

1. **Hero.** `.kick` "The science" · h1 "What Soma actually measures — and what it
   doesn't." · lead: one honest paragraph. Set the tone immediately: this page is as
   much about the boundary as the capability.
2. **The gap analytics leave.** Platform retention graphs tell you *what* happened
   (the swipe), not *why*. Surveys/focus groups → post-hoc rationalization. (This is
   VidCognition's strongest section — the framing is fair game; the copy is ours.)
3. **What fMRI measures & why it's ground truth** — BOLD signal, spatial+temporal
   activation map. Short, plain, honest. Badge: the *encoder* step is **validated**
   (green) — it's Meta's, benchmarked.
4. **TRIBE v2, plainly** — Meta's public, Algonauts-2025-winning encoder: video →
   predicted cortical activation, ~20k fsaverage5 vertices, 1 Hz. **Say "Algonauts-
   winning," not "peer-reviewed"** (CLAUDE.md rule). Green badge on this step.
   **Crucial honesty beat:** cite Meta's ~92% correlation *correctly* — it's the
   accuracy of **video → activation**, and it is **not** a claim about
   activation → engagement. Explicitly say so. This single sentence is where we
   out-credibility VidCognition, who blur exactly this line.
5. **The 3-step chain — only step 1 is validated** (lift the CLAUDE.md diagram):
   - video → activation — **validated** (green, Meta's)
   - activation → summary metrics — descriptive arithmetic (neutral)
   - metrics → "attention/engagement" — **our hypothesis, validating now** (amber)
   This is the spine of the whole page. Render it as a labeled 3-rung visual with
   tier badges.
6. **The reverse-inference trap** — a spike in activation ≠ a specific feeling; the
   same peak could be interest, confusion, mild alarm, or noise. Only behavior
   settles it. Stating this *unprompted* is the credibility move.
7. **How we validate (and how you can check us)** — TVSum (20 annotators, within-
   video, first-differenced, circular-shift permutation null, leave-one-annotator-out
   ceiling); LIRIS-ACCEDE for affect; the incremental-validity guard ("does the
   neural read beat a dumb loudness/cuts/luminance/motion baseline?"). Name the
   pre-registration. Link the repo. **Disclose the negative prior** (whole-cortex
   global drive does *not* predict YouTube most-replayed) right here — it's the
   strongest trust signal on the page.
8. **The reading guide** (Page 2 content module — see below). Embedded here.
9. **Evidence ladder R0→R4** — reuse the roadmap ladder from `index.html` / `VISION.md`.
10. **CTA** → waitlist + demo. Cross-link → `/compare`, `/faq`.

**Honesty constraints:** every neural claim badged; "validated" reserved for the
encoder step; the results section reports method, not a number, until the real run
lands (then auto-fill from `results.json` like the demo does — do **not** hand-type a
correlation). Keep the fMRI-cost / "gated in labs" framing factual, not salesy.

**Est. size:** ~1 self-contained HTML file, ~350–450 lines incl. inline CSS.

---

## Page 2 — the honest reading guide  (content **module**, not a standalone page)

**What it is:** VidCognition's best asset is its plain-English region→pattern
translation ("weak hook = salience spike then decay before 3s," "mid-video cliff =
delayed/unclear payoff," "strong close = late emotional-region activation"). It turns
an abstract cortical map into an actionable creative diagnosis. We want that — done
honestly.

**Why it's a module, not a page:** it's a **copy pattern**, reused in three places:
1. a section inside `science.html` (§8 above),
2. the console **weak-spot callout** wording in `app.js` (so the demo speaks the same
   language),
3. eventually, the per-upload report we send back.

**Format — a repeatable "reading" card:**
```
PATTERN NAME        e.g. "Weak hook"
what you see        the arc/region behavior, plain English
what it may mean    the creative interpretation  ← ALWAYS tier-badged
tier                amber (validating) / red (hypothesis) — never green
```

**The honesty fork vs. VidCognition:** they write "the ACC drops when the payoff
doesn't arrive → the viewer swiped" as **fact.** We write the identical, useful
observation and **badge it amber/red** — "this is our current read of the pattern,
being validated against TVSum; here's what would falsify it." Same actionable value,
labeled. That contrast *is* the marketing.

**Starter set of cards** (draw shapes from the real arc semantics in `app.js`, not
invented numbers):
- **Strong hook** — early salience rise sustained through the open (attention holds
  past the first beats). *amber.*
- **Weak hook** — early spike that returns to baseline before the hook resolves.
  *amber.*
- **Mid-video attention leak** — the arc dims where the promised payoff should land.
  *amber.* This is the weak-spot callout the console already pins.
- **Affective flatline** — valence/arousal stay near neutral through a beat meant to
  land emotionally. *red (hypothesis — affect proxy is unvalidated).*
- **Strong close** — late arousal/valence lift into the CTA. *red.*

**Do NOT:** attach specific second thresholds ("drops at 14s") as universal law, or
claim any card predicts completion. Each card is a *lens*, tier-badged, with a
one-line "what would falsify this."

**Build:** write once as an HTML partial pattern; paste into `science.html`; mirror
the wording into `app.js` callout strings. Keep a canonical copy of the card text
here in this doc so the three locations don't drift.

---

## Page 3 — `compare.html`  (the comparison pages)  ·  route `/compare`

**Job:** SEO + sales enablement + doubles as YC-interview prep. Someone searching
"Soma vs Realeyes" / "Neurons Inc alternative" / "VidCognition vs" should land on our
framing. Content is a straight lift from `../COMPETITORS.md` (single source of truth —
**do not** re-argue positioning here; render it).

**Structure — one hub page with anchored sections** (recommended over N separate
pages for a sprint; note the tradeoff below):
1. **Hero** — `.kick` "How Soma compares" · h1 "Predicted from the file — not a panel,
   a webcam, or an LLM guessing." · the one-sentence version from `COMPETITORS.md`.
2. **The signal-source table** — the 4-camp table (panel-neuro / panel-survey /
   synthetic / same-model). This is the whole thesis in one glance.
3. **Anchored per-competitor sections** (`#vs-realeyes`, `#vs-neurons`, `#vs-system1`,
   `#vs-vidcognition`, `#vs-synthetic`) — each: what they do · where they're genuinely
   strong (always, it reads as confidence) · how Soma differs · the honest caveat.
   Pull verbatim from `COMPETITORS.md`.
4. **What we do NOT claim** — the guardrails block. Surprising and disarming on a
   comparison page; it's a trust asset.
5. **CTA** → demo + waitlist.

**SEO tradeoff (decide before building):** one hub page ranks for "Soma comparison"
and is far cheaper to maintain and keep honest; **separate** `vs-realeyes.html` etc.
rank better for each specific "vs X" query but multiply maintenance and drift risk.
**Recommendation:** ship the hub first (`/compare` with anchors). Only split out a
dedicated page for a competitor if that specific query proves worth it (e.g.
`vs-vidcognition` — the closest analog and most likely head-to-head search).

**Honesty constraints:** every competitor's genuine strength stated plainly; every
Soma advantage is cost/approach/epistemics (true today) or explicitly roadmap; never
an accuracy claim; competitor facts marked `[verify]` in `COMPETITORS.md` must be
verified or omitted before this page goes public (esp. Neurons' €15k figure and any
VidCognition specifics).

**Est. size:** ~1 file, ~300–400 lines.

---

## Page 5 — `faq.html`  (the skeptic FAQ)  ·  route `/faq`

**Job:** pre-empt the obvious objections in the reader's own voice — and answer them
*straight*, where VidCognition's FAQ deflects into a Meta citation. Ours lands as
more credible precisely because it actually answers.

**Structure:** simple `<dl>` of Q/A pairs (or `<details>` accordions), one self-
contained page. Add **`FAQPage` JSON-LD** (schema.org) so the questions can surface
as rich results — this is the highest-SEO-leverage page of the four.

**Question set (each answer 2–4 sentences, honest, tier-aware):**
- **What does Soma actually measure?** — predicted cortical activation from the file
  (validated encoder), off which we read attention (validating) + coarse affect
  (hypothesis). Name the tiers.
- **Do you measure my viewers' real brains?** — No. It's a *prediction* of the
  average viewer's response from a model trained on real fMRI. No people, no hardware.
  (VidCognition's honest answer — keep it just as honest.)
- **Is the arc validated?** — The **encoder** is (Meta, benchmarked). The
  **attention read-out** is being validated right now against public human data
  (TVSum); we report the result either way, including a null. The **affect** read is
  a labeled hypothesis. *Do not claim more than the current run supports.*
- **What's the ~92% number I've seen?** — That's Meta's TRIBE encoder accuracy for
  **video → brain activation**. It is *not* a claim that our engagement read predicts
  completion — a distinction some tools blur. (Direct, factual contrast with
  VidCognition, no name-calling.)
- **Better than prompting GPT / synthetic personas?** — GPT imagines what someone
  would *say* (agreeable-answer bias, no biology); we predict the neural response,
  reproducible run to run.
- **Why won't Realeyes/Neurons just build this?** — Business-model conflict — a
  public, from-the-file model undercuts panel recruitment + per-study pricing.
- **Isn't the model public? What's the moat?** — Yes, `facebook/tribev2` is public.
  The moat is honest validation + the product + the proprietary ad×outcome data
  flywheel — never the model. (Stating this openly is the credibility play.)
- **What can't it do yet?** — Named emotions, calibrated retention prediction — those
  are roadmap rungs earned by held-out tests (link `/science` §ladder). Reverse
  inference is a real limit: a spike ≠ a specific feeling.
- **What formats / how fast / how much?** — short-form video (TikTok/Reels/Shorts/
  ads); minutes from the file; performance-team pricing (finalize before publishing).
- **License note** — TRIBE's license is non-commercial [verify]; the frozen encoder
  powers R&D + the demo; the paid pipeline needs a commercial license or a
  differently-licensed encoder. Only include publicly once the story is settled.

**Honesty constraints:** answers must survive a neuroscientist reading them; where the
truthful answer is "we don't know yet, we're testing it," say that — it's the whole
brand. Reuse the top 3 Q/As as a condensed FAQ block at the bottom of `science.html`.

**Est. size:** ~1 file, ~250–350 lines incl. JSON-LD.

---

## Build order (dependency-aware)

1. **`COMPETITORS.md`** — ✅ done (source of truth for Page 3 + FAQ competitor Qs).
2. **Reading-guide card copy** (Page 2) — write the canonical card text in this doc
   first; it's consumed by Pages 1 & the console.
3. **`science.html`** (Page 1) — the anchor page; establishes the reusable inline-CSS
   shell, tier-badge snippet, and 3-step-chain visual the others reuse.
4. **`faq.html`** (Page 5) — reuses the science shell; highest SEO leverage; quick.
5. **`compare.html`** (Page 3) — pure render of `COMPETITORS.md` into the same shell.
6. **Nav wiring** — add `Science · Compare · FAQ` to every page's nav/footer.
7. **`vercel.json`** — optional `cleanUrls`; confirm no CSP change needed (static text
   pages fetch nothing). Verify AA contrast + reduced-motion on each before deploy.
8. **Pre-deploy review** — run the same multi-lens adversarial review used for demo
   changes (regression / cross-page / responsive-a11y / **honesty-brand** / git-scope).
   The honesty lens is the gate here: no un-badged neural claim ships.

## Definition of done (per page)

- [ ] Self-contained, no build step, auditable in DevTools.
- [ ] Every neural claim carries an evidence tier with a text label.
- [ ] "Validated/green" appears only on the video→activation (encoder) step.
- [ ] No banned pattern (`DESIGN.md` §Absolute bans).
- [ ] WCAG AA contrast verified; full reduced-motion path; keyboard-operable.
- [ ] Real `<title>`/description/OG + JSON-LD where applicable.
- [ ] Cross-linked into the shared nav; competitor `[verify]` facts confirmed or cut.
- [ ] No hand-typed result numbers — auto-filled from `results.json` when real.
