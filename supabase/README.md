# Supabase setup (Soma)

Two tables back the demo:

| Table | Written by | Read by | Purpose |
|---|---|---|---|
| `waitlist` | the browser (anon key, insert-only) | you (dashboard / service key) | early-access signups from `demo/waitlist.html` |
| `arcs` | the pipeline (service_role key) | the browser (anon key, public read) | shared ad-analysis results (per-second arcs) |

Row-level security is on for both. The **anon/public key** (which ships in the
browser) can *only* insert a waitlist row and read public arcs — it can never read
the email list or write results. The **service_role key** is secret and stays
server-side (pipeline only).

---

## One-time setup (~3 minutes)

**1. Create the project** — [supabase.com](https://supabase.com) → *New project*.
Pick a name, region (closest to you), and a database password.

**2. Create the tables** — Dashboard → **SQL Editor** → *New query* → paste all of
[`schema.sql`](./schema.sql) → **Run**. (Re-runnable; safe to run again later.)

**3. Wire the demo** — Dashboard → **Settings → API**, copy the **Project URL** and
the **anon / public** key into [`../demo/supabase-config.js`](../demo/supabase-config.js):

```js
window.SOMA_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "eyJhbGciOi...your-anon-key..."
};
```

Commit + push — Vercel redeploys and the waitlist now writes to the database.
(The anon key is safe to commit; it's public by design and gated by RLS.)

> Until those two fields are filled, the site keeps working exactly as before
> (waitlist → `localStorage`). Nothing breaks in the meantime.

---

## Reading the waitlist

The public key can't read it (by design). Use the dashboard: **Table editor →
`waitlist`**. Or export server-side with the service_role key.

---

## Pipeline → `arcs` (optional, later)

To publish real results into the shared `arcs` table, the Python pipeline uses the
**service_role** key (never the anon key, never committed):

```bash
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...service-role..."   # secret; keep out of git
```

Ask and I'll add an uploader (e.g. `publish_to_supabase.py`) that pushes each
`arc_<id>.json` into `arcs`, and point the demo's console at `Soma.supabase.fetchArcs()`
so the team shares one dataset. Put the two env vars in a local `.env` (already
git-ignored) — never in `supabase-config.js`.
