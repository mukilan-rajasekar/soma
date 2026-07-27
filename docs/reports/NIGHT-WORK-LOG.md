# 🛠️ Night Work Log — 2026-07-19

*What I actually changed & deployed overnight while you slept. Every change is an
atomic commit (easy to revert), verified in a real browser before push, and
confirmed live after. Companion: `NIGHT-AUDIT-2026-07-19.md` = the full state + TODO.*

**Guardrails I held to:** favored bug fixes / robustness / a11y / honesty-label
correctness / perf over subjective restyling (a parallel pass just tuned the visual
design — I didn't fight it). Nothing touches the science or fabricates any result.
The one judgment call — restoring honesty labels the recent polish had dropped — I
made because the repo's own rules (CLAUDE.md, DESIGN.md) mandate it and all four
audits flagged it; review and revert to taste.

---

## Changes

<!-- appended as I go, newest last -->

### 1. Restored honesty labels on the console read-out — `298da86` ✅ deployed
**Why:** the recent polish pass removed the per-lane evidence tiers and firmed up
copy, so the data console presented an *unvalidated hypothesis* (activation →
attention/affect) in result-grade language. For an honesty-first pitch that's the
single most diligence-dangerous thing in the demo; all four audits flagged it.
**What:**
- Added per-lane evidence badges — attention = amber **"predicted · validating"**,
  valence + arousal = red **"hypothesis"** (with explanatory tooltips). Matches the
  DESIGN.md tier system + the badges already in pitch.html. Verified in-browser:
  amber `#FFCB5C` / red `#FF7A7A`, no console errors.
- Empty-affect lanes now say *"affect not computed for this clip — pick a sample ad
  to see the read-out"* (was a bare "no affect data" that read as broken — the
  default card is the affect-less real run, so this shows on first paint).
- Roadmap: "2D affect — **Shipping now**" → "**In validation**"; vision copy
  "Attention and 2D affect ship today" → "attention ships today; 2D affect is in
  validation." Affect is a red hypothesis everywhere else in the repo.
- Files: `demo/index.html`, `demo/styles.css`, `demo/app.js`.
- **Reversible:** `git revert 298da86` if you prefer the confident framing.

### 2. Trimmed dead assets — `0ff2d8e` ✅ deployed
**Why:** ~935 KB of unused files were in the deploy bundle + repo.
**What:** removed `demo/assets/fs5_*.bin` (819 KB — brain3d loads fs6 only) and
`demo/vendor/gsap` (116 KB — referenced nowhere). Verified in-browser the 3D hero
still loads (`brain3d-on`, no errors); live: fs5→404, fs6→200, gsap→404.

### 3. fsaverage wording + non-silent waitlist log — `5ccdf81` ✅ deployed
**Why:** two small diligence nitpicks + a silent-failure gap.
**What:**
- `brain3d.js` comments said "fsaverage5" but the hero loads fs6 — it genuinely IS
  fsaverage6; fixed. Console chip called the hand-drawn silhouette an "fsaverage5
  surface" → "illustrative regional view, not a per-vertex render."
- `waitlist.html`: `console.warn` on `join_waitlist` failure so a broken RPC can't
  lose signups *fully* silently. **Visitor-facing UX unchanged** — flipping the
  false-"thanks" to an honest error (and any contact email) is a conversion/privacy
  product call I left to you. *(Note: I verified the `join_waitlist` function in
  `schema.sql` is correctly written, so your morning re-run WILL clear the live 42702.)*

### 4. Favicon + social link-preview + meta description — `6b275d9` ✅ deployed
**Why:** the landing page had a blank tab icon, no meta description, and no Open
Graph/Twitter cards — a shared `soma-jet-tau.vercel.app` link rendered as a bare URL.
Cheap, high-value before the demo goes to YC + prospects.
**What:** brand-orb `favicon.svg` (matches the nav orb), honest og:/twitter: cards
(framing matches the hero, no overclaim), meta description, `theme-color`,
`color-scheme:dark`; same favicon + description on `waitlist.html`. All same-origin,
CSP-clean (verified: favicon 200, no CSP violations). *Note: cards are text-only
(`twitter:card=summary`) — add an `og:image` later for a picture preview.*

### 5. Rewrote the stale `demo/README.md` — `c60b8a0` ✅ pushed (repo doc, not on the site)
**Why:** it called the upload box a "deliberate disabled stub," documented a `?arc=`
param, a "cached-result" chip, and a "two-tier banner" — none of which still exist. A
demo contradicting its own docs is a diligence smell.
**What:** rewrote to describe the real page (3D hero, 3-lane console + evidence badges,
the real upload intake, live-arc publishing, honest-label inventory, deploy flow).

---

## Final state
- **6 commits** overnight: `298da86` → `c60b8a0` (5 mine + the pre-existing `f214784`).
- **Production verified healthy** after all deploys: 3D hero loads, 3 honesty badges
  live, favicon + OG cards live, Supabase enabled, **no console errors** on prod.
- Nothing touched the science/pipeline or fabricated any result. Every change is an
  atomic commit — revert any single one cleanly if you disagree.

## Still pending (safe, but I stopped here — flagged for you)
- **`results.example.json`** claims "app.js fetches results.json" — it doesn't. Wire a
  real validation strip once the ROI run gives a number, or drop the claim.
- **Waitlist false-success UX** — see batch 3; a product decision for you.
- Everything in `NIGHT-AUDIT-2026-07-19.md` §4–5.
