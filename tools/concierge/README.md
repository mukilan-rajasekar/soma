# The concierge loop

How a customer's batch becomes a delivered read-out, and who does what.

```
  /upload  ──▶  batches (queued)  ──▶  run_batch.py  ──▶  batches (done)  ──▶  /r/<token>
   form           Supabase              a rented box        report jsonb        the customer
```

Everything below the form is one command.

---

## One-time setup

**1. Apply the migration.** `supabase/migrations/0003_batches.sql` creates the `batches`
table, links `uploads` to it, and is idempotent — paste it into the Supabase SQL editor
and run it. Nothing works until this exists.

**2. Env.** The runner reads `.env` from the repo root (the Next app reads `.env.local`
then `.env` — see AGENTS.md). Either naming scheme works:

```
SUPABASE_URL=...                  # or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=...     # or SUPABASE_SECRET_KEY
```

The service key bypasses RLS. Server-side only, never in a browser, never committed.

**3. The box.** Follow `demo/README.md` § Install. The runner shells out to
`demo/process_batch.py` from this checkout, so `batch_extract.py` is already where the
scorer expects it and there is no tree to ship.

Install `faster-whisper` and `tesseract-ocr` even though the run works without them. They
are what makes Communication Clarity — **25% of the score** — measure anything. Without
them every ad ties at 50, the runner warns, and the customer's report says plainly that a
quarter of their score carried no signal.

---

## Running a batch

```bash
# what's waiting
python tools/concierge/run_batch.py --list

# run one (accepts the uuid or the share token)
python tools/concierge/run_batch.py 9f3c8a12-...

# re-score after a weights change, no GPU, from the preds cache
python tools/concierge/run_batch.py 9f3c8a12-... --force --skip-tribe

# everything except the writes
python tools/concierge/run_batch.py 9f3c8a12-... --dry-run

# claim the oldest queued batch and run it once
python tools/concierge/run_batch.py --next

# stay up and work the queue continuously
python tools/concierge/run_batch.py --watch --poll-seconds 60
```

The runner claims the row (`queued → processing`) before doing any long work, so a second
operator running `--list` sees it is taken rather than starting the same GPU job twice.

`--next` is the one-shot worker mode: take the oldest queued batch, run it, exit.

`--watch` is the overnight mode: poll the queue, claim work atomically, and keep going
until interrupted. It is meant to be launched once on the scoring box and left alone.

On success it prints the customer's address. On failure the row goes to `failed` with a
sentence written for the customer, and **nothing is published**.

---

## The gate, and why it is not advisory

`demo/README.md` lists four lines an operator is supposed to read before trusting a run.
Two of them are absolute, and a person reading them by eye is a person who will eventually
be tired at 2am. They are conditions in `run_batch.py:gate()` instead:

| Condition | Verdict | Why |
|---|---|---|
| `sanity.visualPositive` is not `true` | **fatal** | Content minus a black screen must drive occipital cortex. If it doesn't, the vertex order, the Schaefer mask, or the content/baseline alignment is wrong and — `demo/README.md`'s own words — "no number in this file should be trusted." |
| any `predsStats.looksBounded01` | **fatal** | TRIBE came back bounded `[0,1]` instead of signed. The whole baseline-subtracted contrast design assumes signed BOLD; these numbers are not valid. |
| `perRunZscoreVerdict` ≠ `fixed_stats_likely` | warn | Cross-ad *levels* aren't comparable. The scorer already compensates by switching the chart to the `psc` lane, so the run is still usable. |
| `crossAdLevelsTrustworthy` is `false` | warn | Same family. Travels to the customer inside the artifact. |
| every ad flagged `no_asr_backend` / `no_ocr_backend` | warn | Clarity is inert. See setup step 3. |

Fatal means the customer sees "this run didn't finish" and the reason, which is the
correct outcome. Publishing a number we cannot stand behind is the one thing this script
exists to prevent.

Warnings are **not** swallowed: they are appended to `report.warnings`, and `/r/<token>`
renders that list verbatim alongside `comparability`, `sanity` and the per-cut flags.

`test_run_batch_gate.py` pins all of it, including that the real committed artifact still
passes — a gate that blocks good runs gets disabled, which is worse than no gate.

---

## What the customer sees

`/r/<share_token>`, which is a capability URL: holding it is the authorization. No account,
no login, `noindex`. Four states:

- **queued** / **processing** — a status page that polls itself and says how long it's been
- **failed** — what stopped, in English
- **done** — the read-out: the ranking, every cut second by second, the batch on one axis,
  the hook comparison, the timestamped weak spots, the brief echoed back so they can check
  we scored against the message they meant, and the run's own limits

Media is stored in the **private** `uploads` bucket under `results/<batch_id>/` and served
as one-hour signed URLs minted per request. The report stores object keys, not URLs, so
nothing in the database goes stale.

If `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are present, the runner also sends lifecycle
emails when a batch starts, finishes, or fails. The body always points back at `/r/<token>`,
which stays the source of truth.

---

## Design notes worth knowing before changing something

**The manifest is never rebuilt.** `src/lib/batch.ts:buildManifest()` writes it in
`process_batch.py`'s own format at intake, it is stored verbatim in `batches.manifest`, and
the runner writes it to disk verbatim. There is no mapping layer anywhere in the chain. If
you need to reshape it, do it in `buildManifest()` — one place, and the form and the
pipeline move together.

**Ad ids are minted, not taken.** `ad_01`…`ad_10` in submission order, with the file named
`<ad_id>.mp4`. Nothing depends on a customer's filename surviving sanitisation, and two
files called `final_FINAL_v2.mp4` cannot collide.

**`--video-url-prefix` does the media wiring.** The runner passes
`results/<batch_id>`, so the scorer emits storage keys directly into the artifact's
`video`/`poster` fields. There is no rewriting pass to keep in step.

**Two intakes, one uploader.** The landing page's dialog (single ad, no brief, no ranking)
and `/upload` (a batch) are deliberately separate products, but both go through
`src/lib/upload-client.ts` and the same `/api/uploads/sign`. Keep it that way.

---

## Still not built yet

- **Queue-started confirmation from the site itself.** The runner emails on processing /
  done / failed. The instant "we received your batch" email still belongs at intake time.
- **A managed process wrapper.** `--watch` gives the box a real worker mode; running it
  under launchd, systemd, tmux, or another supervisor is still an operator choice.
