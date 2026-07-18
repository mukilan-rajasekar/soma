# Supabase setup (Soma)

Three tables + one storage bucket back the demo:

| Object | Written by | Read by | Purpose |
|---|---|---|---|
| `waitlist` (table) | the browser (anon key, insert-only) | you (dashboard / service key) | early-access signups from `demo/waitlist.html` |
| `arcs` (table) | the pipeline (`publish_to_supabase.py`, service_role) | the browser (anon key, public read) | shared ad-analysis results (per-second arcs) — the demo renders these **live** |
| `uploads` (table) | the browser (anon key, insert-only) | you (dashboard / service key) | concierge intake queue for "Upload your own ad" |
| `uploads` (bucket) | the browser (anon key, insert-only) | you (service_role, server-side) | the raw video bytes a visitor sends |

Row-level security is on for everything. The **anon/public key** (which ships in
the browser) can *only*: insert a waitlist row, read public arcs, insert an upload
row, and drop a file into the `uploads` bucket. It can **never** read the email
list, read the intake queue, read other people's videos, or write results. The
**service_role key** is secret, stays server-side, and bypasses RLS (pipeline only).

---

## One-time setup (~3 minutes)

**1. Create the project** — [supabase.com](https://supabase.com) → *New project*.
Pick a name, region (closest to you), and a database password.

**2. Create the tables + bucket** — Dashboard → **SQL Editor** → *New query* →
paste all of [`schema.sql`](./schema.sql) → **Run**. This creates the tables, the
policies, **and** the private `uploads` storage bucket. (Re-runnable; safe to run
again after adding the upload feature.)

**3. Wire the demo** — Dashboard → **Settings → API**, copy the **Project URL** and
the **anon / public** (publishable) key into
[`../demo/supabase-config.js`](../demo/supabase-config.js):

```js
window.SOMA_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "sb_publishable_...your-publishable-key..."
};
```

Commit + push — Vercel redeploys and the waitlist + upload box now write to the
database. (The publishable key is safe to commit; it's public by design, gated by RLS.)

> Until those two fields are filled, the site keeps working exactly as before
> (waitlist → `localStorage`, upload box shows a friendly "not configured" note).

---

## The live loop (this is the point)

```
Colab / batch_extract.py  →  arc_<id>.json  →  publish_to_supabase.py  →  arcs table
                                                                          │
                                    demo console  ←  Soma.supabase.fetchArcs()  (live, no redeploy)
```

Publish any arc you produce and it shows up in the demo's video picker on the next
page load — **no commit, no Vercel deploy.**

```bash
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="sb_secret_...service-role..."   # secret; keep out of git

# one file
python publish_to_supabase.py demo/arcs/hero2.json --title "App promo (30s)"
# many, from a Colab/Drive run
python publish_to_supabase.py "data/arcs/arc_*.json" --dataset hero-ads --run-id run7
# preview without sending
python publish_to_supabase.py demo/arcs/*.json --dry-run
```

`ad_id` comes from `arc.video_id` (or the filename); re-publishing the same `ad_id`
**updates** the row (upsert). `meta` carries provenance + the arc's own honesty
ladder, never fabricated numbers. Put the two env vars in a local `.env` (already
git-ignored) — never in `supabase-config.js`.

---

## The concierge intake ("Upload your own ad")

A visitor picks a video → the browser uploads it to the private `uploads` bucket
and files one `uploads` row (email + filename + storage path + `status='queued'`).
Then, server-side:

1. **See the queue** — Dashboard → **Table editor → `uploads`** (filter `status = queued`).
2. **Get the file** — Dashboard → **Storage → `uploads`** bucket → the `storage_path`
   from the row → download. (Or pull it server-side with the service_role key.)
3. **Run the pipeline** on it → `arc_<id>.json` → `python publish_to_supabase.py arc_<id>.json`.
4. It's now live in the demo; email the person their read. Mark the row `done`.

Guards baked into `schema.sql`: bucket is **private** (150 MB cap, video mime-types
only), anon can **insert only** (no list/read), and the intake table is **write-only**
for anon. Anyone can drop a file in, but no one can read anyone else's — the same
posture as the waitlist.

---

## Reading the waitlist / intake queue

The public key can't read either (by design). Use the dashboard: **Table editor →
`waitlist`** / **`uploads`**. Or export server-side with the service_role key.

---

## Security & key hygiene

### CSP smoke-test (do this after every deploy)

The demo ships a Content-Security-Policy via [`../demo/vercel.json`](../demo/vercel.json).
It pins the exact Supabase project origin in `connect-src` + `media-src`, so a
**mis-scoped CSP is the one way this silently breaks**. After every deploy, smoke-test
all four Supabase-touching paths in the browser (open DevTools → Console, watch for CSP
violations):

1. **Arcs fetch** — the video picker populates (`connect-src` to Supabase).
2. **Waitlist insert** — submit `waitlist.html`, confirm a row lands.
3. **Upload** — drop a video in the concierge box, confirm the file + `uploads` row.
4. **Preview** — the uploaded/hero video actually plays (`media-src` to Supabase).

If any of these fail with a CSP error, the pinned origin in `demo/vercel.json` is wrong —
fix the origin, don't loosen the policy.

> **Post-YC follow-up:** `index.html` deliberately ships inline `<script>`/inline styles,
> so the CSP allows `script-src 'self' 'unsafe-inline'` + `style-src 'self' 'unsafe-inline'`.
> After the sprint, externalize the inline scripts/styles into files and drop `'unsafe-inline'`
> from both directives — that closes the last XSS gap the current policy leaves open.

### Anon / publishable key rotation

The publishable (anon) key is public by design (RLS gates it), but rotate it on a cadence
anyway so a stale key never outlives the people who've seen it:

- **Cadence:** rotate every **6–12 months**, and **immediately** on a team departure or any
  suspected exposure.
- **Steps:** Dashboard → **Settings → API** → roll the **publishable** key → update
  [`../demo/supabase-config.js`](../demo/supabase-config.js) with the new key → **redeploy**
  (Vercel picks it up). The site keeps working through the swap; old key stops after the roll.
- **service_role key:** this one bypasses RLS and lives only server-side (pipeline env var,
  never in `supabase-config.js`). If it is **ever** exposed, rotate it **instantly** — a
  leaked service_role key can read every table and every uploaded video.

### Secret-leak guard (run before every push)

```bash
grep -rnE 'sb_secret_|service_role' demo/ | grep -v vendor
```

This must return **nothing but doc-comment warnings** (the "NEVER put the service_role key
here" notes). Any real `sb_secret_...` value or service_role key match under `demo/` is a
leak — stop and rotate that key before pushing.

---

## Schema changelog

**We do NOT use Supabase CLI migrations.** For one project + 3 people, the CLI's
Docker/toolchain setup is a rabbit hole that isn't worth it. [`schema.sql`](./schema.sql)
is already **fully idempotent** (every `create ... if not exists` / `drop policy if exists` /
`on conflict do update`), so **re-pasting the whole file into the SQL Editor IS a safe
migration** — it converges the database to the current schema no matter what state it's in.
Bump the `-- schema vN` line at the top of `schema.sql` and add a row here on every change.

| Date | Change | Applied by |
|---|---|---|
| 2026-07-18 | **v1** — initial schema: `waitlist` table (write-only anon), `arcs` table (public read / service_role write), `uploads` table (write-only anon intake queue), private `uploads` storage bucket (150 MB cap, video mime-types, insert-only anon). | Mukilan |

> **Caveat — non-idempotent changes.** Re-pasting is safe only for additive/idempotent
> changes. A change that **drops a column, renames something, or tightens a policy that must
> be dropped-then-recreated** is NOT covered by a plain re-paste — it needs **guarded SQL**
> (e.g. `alter table ... drop column if exists ...`, `drop policy if exists ...` before the
> new `create policy`) or an **explicit manual step**, and that step MUST be logged as its own
> row in the table above so the next person re-pasting doesn't lose it.
