# Soma — Y Combinator application (Fall 2026) — DEFINITIVE DRAFT

> **Status: DEFINITIVE DRAFT for the founders to edit.** This consolidates and replaces the two
> earlier drafts (`docs/GTM/YC-APPLICATION.md` solo-founder version and
> `docs/strategy/YC-APPLICATION.md`). Every answer is written to be honest and consistent with the
> signed pre-registration (`docs/science/PREREGISTRATION-addendum.md`) and the strategy docs.
> Anything only a founder can know is marked **[FILL: …]** with a strong suggested draft — accept or edit,
> but don't ship a `[FILL]` as-is.
>
> **Brand:** Soma (the neuron's cell body — on-theme for a brain-encoding company; was NEURACAST → SomAI → Soma).
> **Batch:** Fall 2026. **On-time deadline:** Mon **Jul 27, 2026, 8:00 PM PT** (decisions by Aug 28; free to
> apply; the application carries over if you reapply with more progress). **Standard YC deal:** **$500K = $125K
> for 7% on a post-money SAFE + $375K uncapped MFN.**
>
> **Guiding frame — use it everywhere:** *discovery-engine north star (forward-looking vision), measurement
> wedge today (what we can sell now).* Only step 1 (video → brain activation) is proven, and it is **Meta's**,
> not ours. Our early evidence is the learned read-out head (an honest hypothesis on a public proxy, **never**
> "validated"). The moat is the proprietary ad × real-outcome data flywheel plus the honest inference/validation
> layer and workflow/speed/focus — **not** the (public) brain model. **Report the null the same as the win.**
>
> **Honesty rules baked in (do not undo):**
> 1. Never call the read-out head "validated." The pre-registered PRIMARY (raw DMN arc vs TVSum) came back **NULL**
>    (Stouffer p ≈ 0.69); the head is an early **learned hypothesis on a public proxy** (TVSum importance ≠ retention).
> 2. The only validated step is video → brain activation, and that is **Meta's** result (TRIBE won Algonauts 2025).
> 3. The "92%" figure is **VidCognition's own marketing number** — never attributed to Soma or Meta, and not
>    TRIBE's actual accuracy. TRIBE's real encoder accuracy is **~0.21 mean Pearson**.
> 4. Say "Algonauts-2025-winning" / "public," **not** "peer-reviewed," until a reviewed venue publishes TRIBE.
> 5. We **predict a group-average cortical response**; we do **not measure** any individual's brain — never
>    relabel a prediction as a measurement (no "digital fMRI of a person").
> 6. "Predict ad performance / retention" is the **goal / the just-built backtest**, never a shipped result.
> 7. TRIBE v2 weights are **CC-BY-NC-4.0** — the paid pipeline needs a written commercial license from Meta
>    (will request; may not get) or a differently-licensed / self-trained encoder. Stated, not hidden.
> 8. No invented cofounder, traction, revenue, or customer count. Pre-revenue, pre-design-partner, waitlist only.
>
> *(Internal pre-submission tooling — the guardrail preamble above and the reviewer checklist at the bottom are
> hygiene for the founders, not answers a partner reads. Trim or move to an internal doc before the final pass;
> keep them here while the draft is still being edited.)*

---

# FOUNDERS

**How long have the founders known one another and how did you meet?**

> The three of us — **Mukilan Rajasekar, Aayaan Sahu, and Aarya Srinivasan** — met in high school at
> **Archbishop Mitty** and have been close friends for **[FILL: ~X years — likely ~8–10 years, since ~high
> school ~2016; confirm]**. We're all technical undergrads now (Columbia, UIUC, Berkeley), we were all
> Tournament-of-Champions debaters on the same circuit, and — most relevant — **the three of us already worked
> together at AfterQuery** before Soma, so this isn't a new pairing. That's the young-founder profile YC has
> funded before (precedent: Aaru): years of real trust plus shipping velocity, not inexperience. We can sell and
> take a hard question, and we've shipped together under pressure.

**Have any of the founders not met in person?**

> No — all three of us have known each other in person for years (high-school classmates), and we've worked
> together in person and remotely at AfterQuery.

**Who writes code, or does other technical work on your product? Was any of it done by a non-founder?**

> All of it is ours; no non-founder wrote product code.
> - **Mukilan** wrote the Soma app, the full extraction pipeline (frozen Meta TRIBE v2 feature extraction,
>   the ridge read-out head, the ffmpeg "dumb-baseline" control, the ad-outcome backtest), the demo player,
>   and the pre-registered honest-statistics harness (pre-registration, circular-shift and label-permutation
>   nulls, leave-one-video-out validation, partial correlations, effect floors).
> - **Aayaan** owns ML + full-stack. His research is on **editing activations in latent space** in an
>   interpretability lab — directly adjacent to reading model activations — and he has separately shipped a
>   production full-stack app (a secure case-management platform for a domestic-violence nonprofit serving 700+
>   survivors, React/Django/PostgreSQL/WebSockets).
> - **Aarya** is the **commercial/GTM founder.** He owns customer discovery, the design-partner pipeline, and
>   the science communication — a philosophy + neuroscience background means he keeps our claims legible and
>   defensible to buyers and reads the fMRI-decoding literature closely. **We're not claiming senior
>   neuroscience in-house; that gap is real and we're filling it with an advisor**, because the un-owned work is
>   the last mile, not the brain model.
>
> **Team shape, stated plainly: two builders + one commercial/GTM founder** — a legitimate, fundable shape, and
> we'd rather claim it honestly than stretch "technical" to cover all three.
>
> We use **Claude Code (Claude Opus)** as a coding assistant to move faster, but every design decision, every
> line of the science, and every honesty guardrail is ours — the discipline that separates "validated" from
> "hypothesis" in this product is a human judgment we make, not something the assistant decides.

**Are you looking for a cofounder?**

> No — we're a complete founding team: **two builders (Mukilan, Aayaan) and a commercial/GTM founder (Aarya).**
> We *are* recruiting a **neuroscience advisor** (not a cofounder) to pressure-test the affect layer. We don't
> have a senior neuroscientist yet, and that's on-narrative: the brain model is public and Algonauts-2025-winning,
> so the un-owned work is the last mile — honest validation, pipeline, UX, and GTM — an execution game a shipping
> team wins. We'd rather add neuroscience depth as an advisor than fake authority we don't have.

**What is the most impressive thing each of you has built or achieved?** *(one per founder)*

> - **Mukilan** — As the **first engineering hire at Krypton AI**, he built an **AI-native equity-research
>   platform covering 3,000+ micro-caps end-to-end** (data ingestion → user-facing output) and **scaled it to
>   5,000+ users in a single month**. He built a **real-time SEC-filing LLM pipeline** that turns **1,000+
>   filings a day into structured briefs in ~30 seconds**, and — as first engineer — **built the investor demo
>   used in Krypton's $250K pre-seed round (Afore Capital).**
> - **Aayaan** — Built and shipped a **secure case-management platform for a domestic-violence nonprofit
>   serving 700+ survivors** (React/Django/PostgreSQL/WebSockets) — real users, real stakes, real security
>   requirements — while also doing **published ML research** (bias research; interpretability work on editing
>   activations in latent space). **National Merit Finalist, 1570 SAT.**
> - **Aarya** — A **Tournament-of-Champions debate champion, top-10 nationally**, who pairs competitive rhetoric
>   with a **philosophy + neuroscience** foundation and an undergrad research post at **Haas** — the person who
>   can both read the honest science and argue the company's position under fire, and who owns the commercial
>   last mile (discovery, design partners, science communication). **1570 SAT.**

**Please tell us about an interesting project, preferably outside of class or work, that two or more of you created together.**

> **[FILL: pick your single best real example — it must be something OTHER than Soma (like the "most impressive
> thing," YC wants a project outside the current startup, ideally outside class/work). Describe what you built,
> who did what, and what actually shipped/happened. Keep it concrete and true.]** Strong candidates from our own
> history:
> - **A debate-circuit prep/tooling system** the three of us built and ran on the Tournament-of-Champions circuit
>   (case libraries, judge-paradigm/matchup prep, evidence tooling) — a real thing multiple of us made together
>   and used to win. **[FILL: confirm what you actually built and shared.]**
> - **A side/hackathon project** two or more of you shipped before or alongside AfterQuery. **[FILL: name it and
>   what it did.]**
>
> *(Note: Soma itself does not satisfy this question — pick something earlier.)*

**Tell us about a time you or one of your cofounders hacked a non-computer system to your advantage.**

> **[FILL: swap in your single best real story — keep it concrete and true.]** Strong candidates from our own
> history:
> - **The debate circuit.** All three of us reached the **Tournament of Champions** — which is less about being
>   "right" than about reverse-engineering *how judges actually decide* and optimizing ruthlessly for it:
>   pre-empting the one argument that loses the round, reading a paradigm in 30 seconds, and building a case the
>   opponent structurally can't answer. That "find the load-bearing objection and neutralize it before it's
>   raised" instinct is exactly how we built Soma's honesty posture — we disclose our own null result before a
>   skeptic can use it against us.
> - **Krypton's early growth (Mukilan).** Reaching **5,000+ users in one month** for a micro-cap research tool
>   wasn't a paid-ads play — it was finding the specific communities of retail analysts who were starving for
>   exactly this data and giving them the thing they'd otherwise assemble by hand.

---

# COMPANY

**What is your company name?**

> **Soma.**

**Describe what your company does in 50 characters or less.** *(pick one — character counts shown, all ≤ 50)*

> - `Predict where your ad loses attention` — **37** ✅  *(safest lead — no neuro claim in the hook)*
> - `Neural pre-testing for video ads` — **32** ✅  *(only if the body immediately qualifies it as a predicted,
>   group-average cortical response)*
> - `Brain-response pre-testing for video ads` — **40** ✅

**Company URL, if any:**

> **https://soma-jet-tau.vercel.app** *(the live demo — confirm this is final, or swap in a custom domain before
> submitting).*

**Founder video (1 minute) — script** *(record on a phone, face to camera; one take is fine; ≤100 MB)*

> "Hi — we're Mukilan, Aayaan, and Aarya, the founders of **Soma**. Meta open-sourced a model that predicts the
> brain's cortical response to video — it won the **Algonauts 2025** benchmark, first out of 263 teams, checked
> against real fMRI. That's the expensive part, and almost nobody has turned it into something a business can use.
>
> Soma is the honest layer on top. Point it at a video ad and it predicts, second by second, where the average
> viewer's attention is likely to hold and where it drops — a **prediction from the file, not a scan of anyone's
> brain**, in minutes, before you spend a dollar on media. Today the demo shows this on sample ads; letting you
> upload your own is our next build.
>
> What we care about most is that we only claim what we've tested. We ran the naive version of our read-out — it
> came back **null** — and we say so, in the product. Our real signal is a **learned read-out head**: on 15
> public videos it tracks the human-interest curve at r ≈ 0.20, against a noisy ~0.23 human ceiling, and it
> survives controlling for **loudness, cuts, luminance, and motion** — so it isn't just re-detecting the edit.
> It's early, and it's a hypothesis on a public proxy, not a validated engagement model — and we label it exactly
> that way.
>
> We've been close since high school and have shipped together since — most recently the three of us at
> AfterQuery. We built the whole pipeline, the demo, and the validation harness ourselves. We'd love to build the
> rest with YC."

**Demo (≤ 3 minutes / 100 MB) — screen-recording script**

> 1. **Open the live demo, pick a pre-scored sample ad.** Show the second-by-second **attention arc** drawn over
>    the video on a synced playhead, with a weak-spot callout pinned to the timeline ("the model predicts you lose
>    them at 0:12"). Say: *"These are pre-scored sample ads — the upload-your-own-ad path is our #1 next build.
>    What you're seeing is a prediction of the average viewer's cortical response from the file — no panel, no
>    webcam, no survey — not a measurement of anyone's brain."*
> 2. **Show the lanes and the honesty tiers baked into the UI.** The **attention arc** carries an amber
>    "predicted · validating" badge — that's the shipping signal. **Valence + arousal appear greyed-out under a
>    red "hypothesis" badge — a research preview shown for transparency, not something we'd sell today.** Say:
>    *"The honesty is the interface — every claim wears its evidence tier, and we don't sell the ones we haven't
>    tested."*
> 3. **Walk the science / validation section.** Point at the 3-step chain: *"video → brain activation is
>    validated — but by Meta, publicly, against real fMRI; that's TRIBE, not our work, and we say so. Activation
>    → attention is our hypothesis under test. Activation → affect is untested."* Then show the real numbers:
>    **raw arc null as pre-registered (Stouffer p ≈ 0.69); the learned head at r ≈ 0.20, combined p = 0.0003;
>    survives the loudness/cuts/luminance/motion control at partial r ≈ 0.18, p = 0.0005.** Say: *"We report the
>    null the same as the win."*
> 4. **End on the ad-outcome backtest and the north star.** Say: *"The next test is whether the score ranks real
>    ads by real performance — the harness is built and it's the gate before we ever pitch an advertiser. That's
>    the wedge that generates the one asset a public model can't give anyone else: proprietary ad × real-outcome
>    data. With it, Soma becomes a creative discovery engine — generate edits, score them, keep the ones that
>    lift real performance. That's the roadmap, not a claim we've proven."*

**Link to the product:** **https://soma-jet-tau.vercel.app** *(same as company URL; confirm final).*  ·  **Login required?** **No.**

**What is your company going to make? Please describe your product and what it does or will do.**

> **Soma is neural pre-testing for video ads — a model that predicts the average viewer's cortical response,
> benchmarked against real fMRI (a prediction, not a scan of anyone).** From that predicted response it reads off
> the handful of signals advertisers act on: an **attention arc** (where the ad holds vs. leaks) and **weak-spot
> callouts** ("the model predicts you lose them at 0:12"). You can drop in several cuts of the same ad and
> **compare every variant on one playhead.** All of it is predicted from the file — no human panel, no webcam, no
> survey — in minutes, at a fraction of what a panel test costs.
>
> **Honest status of the product today.** The live demo scores a **library of pre-computed sample ads** to show
> the output. The **upload → live-score path is not built yet — it's our #1 next build**: the read-out heads
> currently exist as validation code, not an inference endpoint. So this section describes what the product does
> and will do; it does not imply you can upload your own ad and get a score today.
>
> The way we get the signal is what's new. Meta open-sourced **TRIBE v2** — the successor to its
> Algonauts-2025-winning brain-encoding model (1st of 263 teams), benchmarked against real fMRI — which predicts
> the brain's cortical response to any video. **Meta built the eye; Soma builds the lens:** we freeze TRIBE and,
> on top of it, train a small read-out head that distills the generic brain-response firehose into the one signal
> advertisers act on. We do **not** try to out-build Meta's encoder. **And we're plain about how simple today's
> lens is:** it's an intentionally simple, regularized linear (ridge) head, because at n = 15 anything fancier
> overfits. **The defensibility isn't this head — we claim no technical moat today.** It's the *same* architecture
> retrained on the proprietary ad × real-outcome data we don't have yet. We're claiming a path to a moat, not a
> moat we hold now.
>
> **The honest framing is the product.** We keep a hard, visible line between three steps, and the demo shows it:
> - **Validated — video → brain activation.** Public TRIBE vs. real fMRI. *Not our work, and that's the point;
>   we don't reinvent the brain model.*
> - **Our learned hypothesis, under test — activation → attention arc.** Tested against public human-interest
>   data (TVSum), pre-registered, permutation-controlled. Our pre-registered raw test came back **null** and we
>   report it; a **learned** read-out head shows an early signal (held-out r ≈ 0.20) that survives controlling
>   for **loudness/cuts/luminance/motion** — so it isn't just re-deriving the edit. Still early, still a
>   hypothesis on a public proxy (TVSum importance ≠ ad retention), never called "validated."
> - **Untested hypothesis — activation → affect (valence/arousal).** We show it **greyed-out, badged red, as a
>   research preview** — a transparent look at where we're headed, **not a feature we'd sell.** Leading with the
>   one signal we can defend (the attention arc) is stronger than three where two are untested. (Being staged
>   against public per-second ratings, LIRIS-ACCEDE.)
>
> **Where it goes (the north star — forward-looking vision, not a shipped fact).** Today we sell the
> **measurement** — "test your ad before you spend." That wedge is what generates the asset nobody can buy off the
> shelf: proprietary **ad × real-outcome** data from design partners. With that data the same read-out
> architecture retrains on real outcomes, and Soma becomes a **creative discovery engine**: generate edits of a
> client's ad, score them against the outcome-trained model, keep the ones that lift real performance. We stop
> selling a score and start delivering better-performing creative. The brain model is public; the honest read-out
> trained on outcomes, and the trust, are ours.

**Where do you live now, and where would the company be based after YC?**

> **San Francisco, USA / San Francisco, USA.** Mukilan is in **San Francisco** now, full-time on Soma — he was in
> New York for Columbia during the school year, but dropped out to build this, so SF is home now. The company will
> be based in **SF** during and after YC. **[FILL: confirm where Aayaan and Aarya are based this summer — the team
> has been distributed across three schools (UIUC, Berkeley) — and note that all three co-locate in SF for the
> batch.]**

**Explain your decision regarding location.**

> We want to be in person with YC for the batch and close to the performance-marketing and DTC buyers, the ML/GPU
> talent, and the design partners we're recruiting — so **San Francisco.** Mukilan has already relocated there
> full-time; the team co-locates in SF for the batch and after. We're distributed-friendly (three schools) but
> converge on SF.

---

# PROGRESS

**How far along are you?**

> Working pipeline, a live demo, a completed first honest validation run, and a just-built ad-outcome backtest —
> **no revenue yet, waitlist only.** Concretely, in a ~5-day sprint we went from nothing to:
> - **A deployed product** — a self-contained static read-out player (attention arc as the shipping signal, plus
>   a greyed-out valence/arousal research preview on one playhead, weak-spot callouts, A/B variant compare) live
>   on Vercel, with the validated-vs-hypothesis tiers baked into the UI and readable in DevTools (no build step,
>   by design — the honesty is inspectable). *(Note: the demo scores pre-computed sample ads; the upload →
>   live-score path is not built yet — it's our #1 next build.)*
> - **A completed first real GPU run (Jul 19–20):** frozen TRIBE v2 extraction on **15 TVSum clips** (real,
>   signed BOLD confirmed). The pre-registered **PRIMARY** test — does the raw DMN activation arc track the human
>   interest curve — came back **NULL as pre-registered (Stouffer p ≈ 0.69)**, and the raw arc does **not** beat
>   dumb ffmpeg features (0/15). Separately and exploratorily, our **trained read-out head** is the real early
>   signal: leave-one-video-out **median Spearman r ≈ 0.20** against a **low ~0.23 20-annotator human ceiling**
>   (the ceiling itself is low, so the target is genuinely noisy — we read r ≈ 0.20 as a weak early signal, not a
>   near-ceiling result), **combined p = 0.0003**, with 6 of 15 videos individually significant (the effect is
>   distributed, not one outlier), and a shuffle-null that 0/30 runs beat (empirical p ≈ 0.032 at the 30-shuffle
>   floor). It **survives** removing loudness/cuts/luminance/motion (**partial r ≈ 0.18, combined p = 0.0005**),
>   so it is not just re-deriving the edit. Head-beats-the-raw-arc is only **trending** (paired p = 0.087,
>   underpowered at n = 15) — we say so.
> - **A fully test-covered, pre-registered validation harness** — `make test` runs the whole pipeline on
>   synthetic fixtures (**25 checks**) and proves both that it finds a planted signal *and* that it stays quiet on
>   a null control, so the math can't manufacture a fake result.
> - **A just-built ad-outcome backtest harness** — the go/no-go GTM gate that will tell us, *before* we pitch a
>   single advertiser, whether the neural score ranks real ads by real performance over-and-above dumb features
>   (partial-Spearman headline; hard-stops below 6 ads; refuses a poisoned head).
> - **An affect track in progress** — 7 COGNIMUSE films cut (after we found and fixed a credit-alignment bug —
>   see "what have you learned"), extracting on an A100 now (**3/7 preds done; affect head not yet run**).
> - **Customer discovery started** — several conversations with DTC growth leads, performance-marketing media
>   buyers, and boutique-agency founders, notes in hand (verbatim pain + buying-signal quotes fold into the Idea
>   section). **[FILL: exact count + quotes.]**
>
> **Next milestones:** power the attention run up to n ≈ 50 (tightens the head's p and gives the head-beats-arc
> test real power); run the ad-outcome backtest on real ads; land 2–3 DTC / performance-marketing design partners
> to start the proprietary flywheel; build the upload → live-score inference path; and close the generate → score
> → measure loop.

**What tech stack are you using, or planning to use, to build this product? (Include AI models and AI coding tools.)**

> **Built and working today:**
> - **Brain encoder (frozen, inference-only) — Meta TRIBE v2.** Trimodal: **Llama-3.2-3B** (text) +
>   **Wav2Vec2-BERT / `w2v-bert-2.0`** (audio) + **V-JEPA 2** (video) → **fsaverage5 cortical activation, shape
>   (n_timesteps × 20484)** — a predicted activation value per second at ~20,484 cortical surface vertices.
>   The checkpoint ships **WhisperX** transcription for the text branch (we provide no transcript). We run an
>   audio+video override on free Colab T4, and the full trimodal config on an A100; **we report av vs. trimodal
>   side by side, never cherry-picked.**
> - **Our model — a ridge read-out head** (NumPy, closed-form, heavily regularized — intentionally simple at
>   n = 15) over a-priori ROI features (DMN/DAN/valence/arousal/visual masks), plus an **ffmpeg/OpenCV
>   "dumb-baseline" control** (loudness/cuts/luminance/motion) as the incremental-validity comparator.
> - **Honest-stats harness** — pre-registration, circular-shift + label-permutation nulls, leave-one-video-out
>   and leave-one-annotator-out ceilings, partial correlations, effect floors (`MIN_EFFECT_R = 0.10`),
>   Holm–Bonferroni across a declared family of 5 tests.
> - **Compute** — A100 (Colab Pro / rentable RunPod/Lambda/Vast at ~$1–2/hr) for GPU extraction; everything
>   downstream (stats, demo) is CPU/browser-only. Extraction is deterministic and cached to `preds_*.npy`, never
>   re-run at analysis time.
> - **Product** — self-contained static demo (HTML/CSS/JS, WebGL cortex hero as labeled decoration) on **Vercel**;
>   **Supabase** for the waitlist + concierge upload intake.
> - **AI coding tool** — **Claude Code (Claude Opus)** as a coding assistant.
>
> **Planned:** an **inference API** so an uploaded ad receives a head-predicted arc (the read-out heads are
> currently validation-only — they have no inference path yet; this is our #1 build); a single
> extract → reduce → heads → validate command; an **edit-search loop** for the discovery-engine product; and a
> consent/GDPR-safe data layer for partner outcome data.

**Are people using your product?**

> **No.** Waitlist only — it's an honest early-access signup (Supabase-backed, localStorage fallback), with no
> fake stats, no "join 100+ brands," no fabricated logos. We're pre-design-partner.

**Do you have revenue?**

> **No.** Pre-revenue; we haven't charged anyone.

**If you are applying with the same idea as a previous batch, or you pivoted, what did you change and what did you learn?**

> **[FILL: whether you've applied to YC before — likely "First time applying to YC."]** We haven't pivoted the
> company, but we made one internal reframe worth naming: we moved from selling a neuroscience *score* (a
> research-budget sell that requires the buyer to believe our science) toward **selling the outcome** — a closed
> generate → score → measure loop where the neuroscience is an internal ingredient, not the pitch, and the buyer
> only has to see the CPA. We learned the trust barrier is the real constraint in neuro-marketing, and the way
> past it is honest labeling now + delivering measurable lift later.

**Have you participated in an incubator or accelerator?**

> **[FILL: confirm "No."]** For the check: **LLMBDA** (Aayaan/Aarya) and **Krypton AI** (Mukilan) were prior
> companies, **not YC/accelerator-backed** — confirm that's true so this is a clean "No."

**How long have each of you been working on this? How much of that has been full-time?**

> **Mukilan has been full-time for ~a month — he left his role at Krypton AI *and* dropped out of Columbia to
> build Soma full-time.** The most intense build (the pipeline, the first real validation run, and the demo) is
> the last ~week. **[FILL: confirm Aayaan's and Aarya's exact full-time start dates and any earlier part-time
> exploration.]** To answer YC's "one full-time company" point directly: **Aayaan and Aarya are winding down
> LLMBDA** — others are already solving that problem and Soma is the better bet — so all three of us are full-time
> here. The skin in the game is real: a founder left a funded startup and dropped out of school to build this.

**How much money have you raised?**

> **None.** No outside investment.

---

# IDEA

**Why did you pick this idea? Do you have domain expertise? How do you know people need it?**

> We picked it because a **validated, benchmark-winning brain-encoding model became public** (Meta's TRIBE won
> Algonauts 2025) and almost nobody had turned it into something a business can use — and the obvious first
> application, knowing whether an ad will hold attention *before* spending on it, is a real and expensive problem.
> After iOS privacy changes gutted ad targeting, **creative is the main lever brands have left**, and
> performance/DTC teams ship hundreds of paid-social video variants a month with no cheap way to know which hold
> attention. Human pre-testing (Realeyes, System1, Nielsen, panels) needs real people, so it costs thousands and
> takes days per ad; the synthetic-research wave (Aaru, Simile) is fast and cheap but ungrounded — an LLM
> role-playing a consumer.
>
> **Domain expertise:** the un-owned work here is the last mile — honest validation, pipeline, UX, GTM — which is
> an **execution game we're built for.** Mukilan has already shipped and raised on an AI-native data product
> (Krypton AI: 3,000+ micro-caps end-to-end, 5,000+ users in a month, a real-time SEC-filing LLM pipeline);
> Aayaan does interpretability research on **editing model activations in latent space** — directly adjacent to
> reading model activations; Aarya owns customer discovery, the design-partner pipeline, and science
> communication (philosophy + neuroscience background — he keeps our claims legible to buyers). All three worked
> together at AfterQuery. **We are not claiming senior neuroscience in-house — that's an advisor gap we're
> filling, on purpose, because the brain model is already public.**
>
> **How we know people need it:** the pain is structural (wasted spend on creative that fails; slow, expensive
> pre-testing), and **we've validated it directly — we've already run several customer-discovery conversations
> with DTC growth leads, performance-marketing media buyers, and boutique-agency founders, and we have notes.**
> **[FILL: paste the real specifics from your call notes — a tally and 1–3 verbatim quotes, e.g. "We've talked to
> N growth/creative leads; X run the weekly 'which cut do I run?' decision with no cheap signal and burn live ad
> spend to A/B test in-market — <verbatim quote>; Y said they'd try a from-the-file pre-test; Z are design-partner
> leads." Use their real words and real numbers — don't round up. This is your strongest non-technical signal, so
> make it concrete.]** Honesty note we keep: we don't yet claim the score predicts ad outcomes — that's exactly
> what the backtest and design partners are for. We'd rather earn that claim than assert it.

**Who are your competitors? What do you understand about your business that they don't?**

> Two incumbent camps plus one direct analog — grouped by **where the signal comes from**, which is the whole
> game:
> - **Human-panel / webcam / biometric — Realeyes, Neurons, System1, Nielsen.** They measure *real* people
>   (which we don't) — a genuine strength, with years of normative data — but through opaque, un-auditable models,
>   at enterprise prices and turnaround built for a few hero spots at brand budgets. Neurons' attention model in
>   particular is mature and validated-in-its-domain; we differentiate on **signal breadth, price, and honesty,
>   not on a superiority claim we haven't earned.**
> - **Synthetic / LLM personas — Aaru, Simile.** Genuinely fast, cheap, and flexible — but **no biology.** They
>   predict what a person might *say* (biased toward agreeable answers), not how a brain responds. Partly a
>   different job (broad simulated survey research vs. our second-by-second neural arc on video) — grounded vs.
>   ungrounded, not strictly either/or.
> - **The direct analog — VidCognition**, which builds on the *same* public TRIBE model. Neither of us owns the
>   eye, so on the model axis we're even — which means the entire contest is **lens + epistemics + the data
>   flywheel.** They present the activation → engagement step as settled fact and lean on a **"92%"** figure that
>   is **VidCognition's own marketing number — not attributable to Soma or Meta, and not TRIBE's actual accuracy**
>   (TRIBE's real encoder accuracy is **~0.21 mean Pearson**). Even at face value it would speak only to
>   video → activation and says nothing about whether their engagement score predicts completion. That's the exact
>   reverse-inference trap we refuse.
>
> **What we understand that they don't:**
> 1. **The model isn't the moat — honesty is the *wedge* (not, by itself, a moat).** `facebook/tribev2` is a
>    public download; anyone can have the same weights, and a competitor can choose to be honest too or just win on
>    results. What honesty buys us is the *entry*: in a field full of neuro-hype, we're the one that shows the
>    visible validated-vs-hypothesis line and *actually runs the held-out test* — and proactively discloses the
>    negative prior (a published result finds a *global* brain-drive signal does **not** predict YouTube
>    most-replayed, which is why we test a specific a-priori region). To a skeptical, technical, previously-burned
>    buyer, disclosed limitations read as more credible — and that buyer is the one who then generates the data
>    that *does* compound.
> 2. **The real asset is proprietary ad × real-outcome data — which is prospective, zero turns today.** A
>    public-encoder rival can scrape the encoder but not the ad-creative-paired-with-real-CPA/ThruPlay data our
>    design partners generate. That's what trains the read-out; it compounds per customer; it's the defensible
>    thing — and we're honest that we don't have any of it yet. Our real claim is that we'll get to it **faster**,
>    as a focused team, and own the trusted brand with the under-served buyer.
> 3. **Sell the outcome, not the score.** The discovery-engine loop (generate → score → measure → retrain)
>    collapses the buyer's trust problem — they don't have to believe our neuroscience, only see the CPA — and it
>    *is* the flywheel.
>
> **The risk we've priced.** This market rewards confident selling, and VidCognition is presumably already selling
> on that bold "92%." The obvious risk is that a competitor overselling out-sells our caution before our data moat
> exists (zero turns today). Our bet: the buyer who's been burned by black-box neuro-vendors converts on a **live
> held-out test and disclosed limits** — and every such buyer becomes an outcome-data partner, the compounding
> asset. If confident-but-ungrounded wins this market, we're wrong; the backtest tells us within weeks.

**How do or will you make money? How much could you make?**

> **Now (the wedge):** per-asset / per-run pre-testing plus a team subscription for performance and DTC teams
> screening dozens of cuts a week — "test before you spend," priced **below existing panel-based pre-tests**
> **[FILL: anchor to the actual tool/panel spend the discovery calls surface — competitor price points (e.g.
> "thousands per test," "Neurons' enterprise tier") should be stated only with a source or a real number you
> confirmed, not asserted from memory]**. Value anchor: **flag a predicted attention drop before you commit six
> figures of media.** This sells into the creative-testing/research budget: real, but belief-dependent, so we
> treat it as the data-collection wedge, not the endgame. *(Pricing is an explicit hypothesis to validate in
> discovery — we deliberately learn buyers' existing budgets and current tool spend rather than asking "what would
> you pay," which yields fantasy answers.)*
>
> **Next (the big line):** the **discovery engine** — generate and rank edits of a client's ad against the
> outcome-trained model and deliver the better-performing creative. This sells into the **production + media
> budget, which is materially larger than the testing budget** **[FILL: anchor this multiple to a citable market
> source or a bottoms-up estimate — do not ship a specific multiplier ("50–100×") as a sourced figure; it isn't
> one]**, and doesn't require the client to believe the neuroscience — only to see the CPA. This is the AI-native
> "sell the work, not the tool" model.
>
> **Rough size (best-estimate, not a promise):** the global ad creative + testing market is large and video is the
> dominant, fastest-growing format, so even a small share of high-volume performance-video budgets is a real
> market. **[FILL: build this bottoms-up and cite it — # target DTC brands + agencies × realistic ACV — and/or
> anchor any top-down figure to a named external source. Do not let an unsourced "tens of billions" stand alone in
> diligence.]**
>
> **Honest constraint we'll name in diligence — and resolve, not just confess.** Meta's TRIBE v2 weights are
> **CC-BY-NC-4.0 (research / non-commercial)**, and Meta publishes no commercial-licensing path — so the frozen
> encoder powers R&D and the demo, **but not a paid pipeline.** We de-risk this rather than hand-wave it: the
> **read-out head and the proprietary outcome data transfer across encoders**, so the paid path runs on either a
> **written commercial license from Meta (we'll request it; may not get it)** or a **differently-licensed /
> self-trained encoder** — and "good enough for a read-out" is far cheaper than *winning* Algonauts, so this is a
> bounded engineering task, not the Meta-scale work we said we don't need to redo. **[FILL: name the specific
> permissively-licensed or self-trainable video/multimodal backbone you'd fall back to, plus a rough
> reproduce-a-good-enough-encoder cost/timeline, so a partner sees a scoped plan, not a hope.]** (A second license
> sits under even a self-trained path: the Llama-3.2-3B text branch carries the Llama 3.2 Community License —
> commercial use allowed with "Built with Llama" attribution and a "Llama-" derivative-name prefix.) We'd rather
> flag this now than have it surface later; it's a product-architecture constraint we're designing around.

**How will you get your first users?**

> **Warm-intro-first, research-mode motion — not paid acquisition.** Our beachhead is **DTC brands +
> performance-marketing agencies running high-volume paid-social video — the buyer Realeyes/System1/Nielsen
> ignore** (the operator making the weekly "which cut do I run?" decision). We reach them through:
> - **Founder-network warm intros** — the YC network once we're in, our schools (Columbia, UIUC, Berkeley), the
>   AfterQuery alumni network, and Krypton AI's users and investors (Afore) — ending every good call with "who
>   are two people you respect who think hard about creative testing?"
> - **Concentrated communities** — r/DTC, r/PPC, r/FacebookAds, the Motion and Foreplay creative-analytics
>   communities, "ad Twitter" (relationship-first, not cold hits), and boutique paid-social agencies (who talk to
>   each other constantly — one happy contact hands you five more).
> - **Honest, research-mode outreach** — a cold email whose subject is a real question ("how do you decide which
>   creative to run?"), disclosing we're pre-launch and still validating; and a <60-word LinkedIn DM. We run
>   Mom-Test discovery (past behavior, real budgets, the last ad that underperformed), then convert genuine pain
>   into a **non-binding, mutual design-partner LOI**: free early access, we run Soma on one of their real ads
>   together, in exchange for candid feedback and (optional, revocable) permission to name them. The confidential
>   ad + performance data that flows from those LOIs is what seeds the moat.

**If you had other ideas you considered, why did you pick this one?**

> **[FILL: your real alternates.]** The one worth naming — because it's our own north star (a forward-looking
> vision) and may be the thing YC funds — is **"Soma as an AI creative discovery engine":** surgically edit a
> client's existing ad (cuts, hook swaps, reordering) against a brain-response reward and deliver the *lift*,
> rather than selling a measurement score. We picked the **measurement wedge first** because it's true and
> sellable today (cost/speed, from the file, no panel — independent of how far the science ladder has climbed)
> *and* because it's what generates the proprietary ad × outcome data the discovery engine needs. Editing real
> footage also sidesteps the video-generation-quality problem. Same company, sequenced: measurement wedge today →
> discovery engine as the flywheel turns.

---

# EQUITY / LEGAL

**Have you formed a legal entity yet?**

> **[FILL: Yes/No + type + jurisdiction — e.g. "Yes, a Delaware C-corp" or "Not yet; will incorporate as a
> Delaware C-corp on acceptance."]**

**What is the equity split among the founders?**

> **[FILL: contingent on incorporation — suggested equal three-way (33/33/33) among Mukilan, Aayaan, and Aarya,
> to be documented on incorporation. Confirm the actual split.]**

**Have you taken any investment?**

> **No** — Soma has taken no outside investment, no SAFEs, no notes. **[FILL: confirm, and wall this off from
> Mukilan's *prior* company Krypton AI, which raised a $250K pre-seed from Afore — that was Krypton, not Soma, so
> no reader conflates them.]**

**Are you currently fundraising?**

> **[FILL: likely No — "Not actively; the YC SAFE would be our first outside capital."]**

---

# CURIOUS

**What convinced you to apply to YC? Did someone encourage you? Have you been to any YC events?**

> **[FILL: personal — who encouraged you / events attended, or "none yet."]** The honest hook: YC has publicly
> championed AI-native companies that **sell the outcome/work rather than a tool**, and AI-native products that
> **generate → test → iterate** — **[FILL: verify the exact 2026 Requests-for-Startups wording before quoting it;
> paraphrase you can defend rather than asserting specific RFS language]**. That's exactly the shape Soma is
> moving toward — a measurement wedge today that becomes a generate-score-measure creative discovery engine — so
> it felt like the right room. YC has also funded exactly our founder profile (young, high-trust technical teams;
> Aaru is both a competitor *and* the precedent), and the interview is a room where a team that reports its own
> null result and can defend it should do well.

**How did you hear about Y Combinator?**

> **[FILL: personal — most likely "Through the startup/founder community and YC's public content (Startup School,
> essays, Requests for Startups)"; name a specific person, alum, or event if one applies. Keep it one honest
> sentence.]**

---

# THE 4 INTERVIEW KILLERS — prep answers

> *(Not a YC form field; the four questions the strategy docs flag as make-or-break for the interview. Answers
> here are updated to the FIRST-REAL-RUN numbers.)*

**1. "n of how many?"** — Two n's, kept apart on purpose. **Step one (video → brain activation) is Meta's, not
ours** — validated on Meta's full Algonauts-2025 benchmark (tens of hours of naturalistic movie fMRI, multiple
subjects); TRIBE won it, 1st of 263. **Algonauts-2025-winning (a public benchmark result), not our work** — the
point is we didn't reinvent the model. **Our own step is early, and we lead with its limits.** The pre-registered
PRIMARY test (raw DMN arc vs TVSum) came back **NULL as pre-registered (Stouffer p ≈ 0.69)** and does not beat
dumb ffmpeg features (0/15). The signal is an **exploratory, learned read-out head fit after the primary failed**:
leave-one-video-out **median Spearman r ≈ 0.20** against a **low ~0.23 20-annotator ceiling** (the ceiling itself
is low, so the target is noisy — a weak early signal, not near-human), **combined p = 0.0003**, and it survives
removing loudness/cuts/luminance/motion (**partial r ≈ 0.18, p = 0.0005**), so it isn't just re-deriving the edit.
But it's **post-hoc, on a public proxy (TVSum importance ≠ ad retention), and unreplicated** — a hypothesis, not a
result; head-beats-raw-arc is only trending (paired p = 0.087, underpowered at n = 15); the affect layer has zero
of our own validation. **And the n that actually decides this company is different: ad × real-outcome pairs from
design partners — which today is zero.** Closing that is the whole plan. We're powering the attention run up to
n ≈ 50; **if it — or the ad backtest — comes back null, we report the null and the wedge is wrong.**

**2. "Why won't Realeyes just build it?"** — They could — the encoder is a download, and they could bolt a cheap
from-the-file tier onto their panel. We say that to their face; we're **not** claiming they can't. The bet is that
they **won't move fast** on a product that undercuts their per-test panel margin: the webcam panel is the exact
asset they sell, so a no-panel public-model product is an internal knife-fight, not a roadmap item. Meanwhile
we're a focused team compounding the one asset neither of us has yet — **ad creative paired with real
CPA/ThruPlay from design partners** — which is prospective, **zero turns today**. So the honest claim isn't that
honesty is a moat (it isn't; a competitor can be honest too, or win on results); it's that **we get to that data
faster** and own the trusted brand with the previously-burned buyer they under-serve — the high-volume, low-price
paid-social long tail they price and pace right past. Honest caveat: they have real humans in the loop and a
normative DB we don't — we claim a different signal source, radically lower cost/latency, and honest labeling, not
superior accuracy.

**3. "Better than prompting GPT?"** — Fair — and **today I can't claim we out-predict a well-prompted LLM on ad
outcomes; nobody's run that head-to-head and our own signal is early.** I lead with that concession. The
difference is what happens next. An LLM persona (Aaru/Simile) samples agreeable, popularity-shaped text with
nothing to check it; our output is a **physical prediction tied to real fMRI, so it's falsifiable** — that's why
we ship our null — and it **retrains on real outcomes as design-partner data arrives**, so it gets grounded and
improves while the LLM guess doesn't. Honest downside: cortex-only and group-average, not a specific person's
reaction, and activation → emotion is still a hypothesis. They're also complementary: the LLM writes the copy; we
predict how the brain is likely to respond to it.

**4. "Who pays and how much?"** — The buyer is the **growth or creative lead at a DTC brand or paid-social agency
running high-volume video** — the person who today burns real ad spend A/B-testing creative live in-market, and
spends **[FILL: $X/mo you learn in discovery]** on tools like **[FILL: named tools]**. We'll price per-run credits
+ a team seat **below that existing spend** — target ACV **[FILL: $Y validated against their real budgets, not a
"what would you pay" guess]**. Value anchor: flag where the model **predicts** an attention drop — a signal we're
validating — so a cut can be pressure-tested before six figures of media. The bigger line is the discovery engine
selling into the production + media budget. Full honesty: **we're pre-revenue, haven't charged anyone, and pricing
is a hypothesis until we have design partners — the backtest is the gate before we quote anyone.**

---

# What have you learned so far? *(strong optional answer — keep it)*

> The biggest lesson was a negative one we chose to keep. An early analysis produced flattering correlations on
> tiny, effectively pseudo data (the old "Hook/Pulse" conclusions on n = 7) — the exact best-of-N self-deception
> a sharp investor dismantles in one question. We quarantined it, removed it, and rebuilt around a
> **pre-registered, autocorrelation-controlled test that's allowed to come back null** — and it did (Stouffer p
> ≈ 0.69). That's when the company got real: our edge is honesty as a discipline. Two more technical lessons we
> disclose proactively: the model outputs **signed, z-scored BOLD** (not a 0–1 "interest" score), and five of six
> naive summary metrics are collinear (r ≈ 1.0), so the time-resolved arc is the only defensible signal; and a
> published result shows a *global* brain-drive signal does **not** predict replay, which is why we test a
> specific a-priori region, not whole-cortex. A live example of the same discipline: we caught a
> **credit-alignment bug** in our affect data (each film clip was silently shifted later by 3–9 minutes of end
> credits — frame-verified on *The Departed*, ~392s of credits, offset ≈ 393.7s) *before* it produced a single
> result, and fixed it. Catching our own errors before they become claims is the company.

---

# REVIEWER HONESTY-GATE CHECKLIST *(internal — run before you submit; not a partner-facing answer)*

- [ ] **No claim the read-out head is "validated."** The pre-registered PRIMARY (raw DMN arc vs TVSum) is
      **NULL (Stouffer p ≈ 0.69)**; the head is an **early learned hypothesis on a public proxy** (TVSum
      importance ≠ retention). Head-beats-raw-arc is **trending** (paired p = 0.087), never "significant."
- [ ] **Only step 1 (video → brain activation) is called validated, and it is stated as META's** (TRIBE won
      Algonauts 2025, 1st of 263) — not ours.
- [ ] **The "92%" is VidCognition's marketing number — never attributed to Soma or Meta, and not TRIBE's
      accuracy;** TRIBE's real encoder accuracy is **~0.21 mean Pearson**. Any competitor accuracy or price
      number carries a source or is omitted.
- [ ] **"Algonauts-2025-winning" / "public," not "peer-reviewed" and not "Published"** (except the separate,
      genuinely-published negative-prior paper, which is correctly labeled).
- [ ] **Prediction, not measurement** — we predict a **group-average, cortex-only** response; we never relabel a
      prediction as a measurement of anyone's brain (no "digital fMRI of a person").
- [ ] **"Predict ad performance / retention" appears only as the goal / the just-built backtest,** never a
      shipped or achieved result. Retention has not been run (no data source since Imran left).
- [ ] **Present tense matches reality** — the upload → live-score path is **not built yet**; the demo scores
      pre-computed sample ads. Don't imply a buyer can upload their ad and get a score today.
- [ ] **CC-BY-NC-4.0 license constraint stated *and de-risked*, not hidden** (Meta commercial license: will
      request, may not get; or differently-licensed/self-trained encoder; Llama-3.2 text-branch terms noted).
- [ ] **The moat is NOT the brain model** (public weights) **and NOT honesty-by-itself.** Moat = honest inference
      + validation layer + **prospective** proprietary ad × real-outcome data flywheel (zero turns today) +
      workflow/speed/focus.
- [ ] **Affect (valence/arousal) is a greyed-out research preview, not a sold feature.** Lead with the attention
      arc.
- [ ] **Team framed honestly** — two builders + one commercial/GTM founder; **no senior neuroscience claimed
      in-house** (advisor gap stated). No invented cofounder, traction, revenue, customer count, or logo.
      Pre-revenue, pre-design-partner, waitlist only. LLMBDA wind-down answered directly.
- [ ] **Every [FILL] replaced with something true** (and at least the user-discovery calls actually done — the
      one cheap thing every applicant can do). Exact numbers quoted precisely (15 clips; r ≈ 0.20; combined
      p = 0.0003; partial r ≈ 0.18, p = 0.0005; ~0.23 human ceiling; family of 5, Holm–Bonferroni, floor
      |r| ≥ 0.10). The null is reported the same as the win.

---

## Footnote — "Has any founder left?" *(prepared answer, only if asked)*

> An early collaborator, **Imran**, who was our private retention-data source, stepped away — which is **why our
> validation currently runs on public data (TVSum) rather than private creator data.** No drama; the team is the
> three cofounders, full-time on Soma. **[FILL: if Imran was ever equity- or founder-level, be ready to say so
> cleanly — a discovered omission is far worse than the fact.]**

*(Canonical YC application draft — consolidates and supersedes the earlier solo-founder GTM draft and the Jul-17
strategy draft (`docs/strategy/YC-APPLICATION.md`, now a source, not the live doc). Four confirmed founder facts
are integrated: the 3-cofounder team (Mukilan / Aayaan / Aarya); Mukilan full-time ~1 month after leaving Krypton
AI and dropping out of Columbia; SF now and after YC; several customer-discovery calls already done (notes in
hand). The strategy draft's one-liner, why-now, four killers, honesty lesson, and LLMBDA answer are folded in;
every honesty-gate constraint holds and all FIRST-REAL-RUN numbers are quoted exactly. Remaining `[FILL]`s are
genuine founder-only facts.)*
