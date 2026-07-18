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
