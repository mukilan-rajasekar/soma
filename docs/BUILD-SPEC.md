# soma — BUILD-SPEC

Implementation blueprint for the `muki/product-features` branch. Next.js 16.2.11 (App Router,
Turbopack, `src/`), React 19.2.4, Tailwind v4 (single `@import "tailwindcss"`, no config file),
three.js r0.185.1, `@supabase/supabase-js` 2.110.8, TypeScript strict, `@/*` → `./src/*`.

This is the single source of truth. Every implementer reads sections A + the appendix first, then
their phase. **Before writing any Next.js code, read the cited files under
`node_modules/next/dist/docs/01-app/`** — this Next version has real breaking changes vs older Next.

---

## 0. Global decisions (read first)

### 0.1 Routing — the landing is a fixed full-screen hero, so everything else gets its own route

`/` renders `Landing` as `fixed inset-0 overflow-hidden`, and `globals.css` forces
`html, body { overflow: hidden }`. The landing takes zero document flow. The interactive console
and all content pages therefore live on **separate routes**, not appended below the hero.

| Route | Phase | Kind | Purpose |
|---|---|---|---|
| `/` | 1, 5 | client hero | Brain hero + waitlist + Upload button. Unchanged shell; Brain rewrite in Phase 5. |
| `/demo` | 2, 3 | client console | Arc player (brain + 4 lanes + transport + picker), then A/B compare + live Supabase arcs. |
| `/science` | 4 | **server** | Honesty page: ad_backtest / validation stats hydrated server-side at request time. |
| `/compare` | 4 | server + client island | Marketing comparison page (soma vs survey/panel testing). Distinct from the `/demo` A/B canvas. |
| `/faq` | 4 | server | FAQ with `FAQPage` JSON-LD. |
| `/pitch` | 4 | server | Investor/pitch narrative page. |

**Scroll on content routes.** Do **not** delete the global `overflow: hidden` (the hero relies on
it). Instead, wrap every scrolling route in its own scroll container. Create a route group
`src/app/(site)/layout.tsx` whose body is `<main className="fixed inset-0 overflow-y-auto bg-white">`
and put `/science`, `/compare`, `/faq`, `/pitch` under `src/app/(site)/`. `/demo` is its own
fixed-viewport console (matches the old single-screen `#console`), so it does not need the scroll
wrapper — it manages its own layout like the landing does. Route groups `(site)` do not affect the
URL.

### 0.2 Env vars (must exist in `.env.local` / Vercel — the Python `.env` names are different)

Reuse the exact two names the waitlist route already uses. Do **not** invent new ones:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL. Public, inlined at build (see A.5).
- `SUPABASE_SECRET_KEY` — service_role/secret key. **Server only**, bypasses RLS, never shipped to
  the browser.

The repo `.env` currently defines only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`SUPABASE_ANON_KEY` (Python pipeline). The Next app will not read those. Flag this to the user: the
waitlist route **and** the new upload routes are dead until `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SECRET_KEY` are set.

### 0.3 One shared server Supabase factory

`src/lib/` does not exist yet. Create it. Every server route uses one factory instead of inlining
`createClient` (the waitlist route inlines it today; leave it, but new code uses the factory).

```ts
// src/lib/supabase.ts  (server-only — imports service_role secret)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null; // caller returns a 500 "not configured", mirroring waitlist route
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
```

---

## A. Next.js 16 idioms & gotchas (mandatory patterns)

Read-before-you-code map (all under `node_modules/next/dist/docs/01-app/`): route handlers →
`01-getting-started/15-route-handlers.md` + `03-api-reference/03-file-conventions/route.md`; actions
→ `02-guides/server-actions.md` + `03-api-reference/01-directives/use-server.md`; metadata →
`03-api-reference/04-functions/generate-metadata.md` + `02-guides/json-ld.md`; env →
`02-guides/environment-variables.md`; nav → `03-api-reference/04-functions/{use-router,redirect}.md`
+ `03-api-reference/02-components/link.md`; caching → `03-api-reference/01-directives/use-cache.md`.

### A.0 The breaking changes that bite first

- ⚠️ `params`, `searchParams`, and Route Handler `context.params` are **Promises** — `await` them
  (server) or `use()` them (client). Sync access is gone.
- ⚠️ `cookies()`, `headers()`, `draftMode()` are **async** — `const h = await headers()`.
- ⚠️ `GET` Route Handlers are **dynamic/uncached by default**. Opt into static with
  `export const dynamic = 'force-static'`. Our POST handlers are dynamic by default = correct.
- ⚠️ **Cache Components is OFF** (`next.config.ts` is empty). `use cache` / `cacheLife` / `cacheTag`
  / `updateTag` will **error** until `cacheComponents: true` is added. Do **not** use them in any
  phase here. For request-time data on `/science` etc., read at request time (dynamic), not `use cache`.

### A.1 Route Handlers — `src/app/api/*/route.ts`

Web `Request`/`Response`. No `bodyParser`, no `res` object.

```ts
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})); // guard bad JSON (waitlist route does this)
  const ua = request.headers.get("user-agent");
  return Response.json({ ok: true }, { status: 201 });
}
```

- `Response.json(data, init)` is the idiom. Reach for `NextResponse` (from `next/server`) only when
  you need cookie/rewrite/redirect helpers.
- Typed dynamic params (⚠️ Promise): `RouteContext<'/items/[slug]'>` is a **global** helper (no
  import), `const { slug } = await ctx.params`.
- Query params on `NextRequest`: `request.nextUrl.searchParams.get("q")`.
- `runtime = 'nodejs'` is default and correct (edge is unsupported with Cache Components anyway).

### A.2 Server Actions — `'use server'`

Not needed for Phase 1 uploads (we use Route Handlers so the browser can PUT bytes directly to
Storage). If any later phase adds one: dedicated file, all exports `async`, every action is a public
POST — authenticate/validate, take an **ID** not a whole object. Client dispatches actions **one at
a time** (no `Promise.all` on client-side actions). Framework adds a 1 MB body cap + CSRF Origin
check.

### A.3 Client vs Server components

- Server Component by default. `'use client'` is a **boundary**, first line of the file, before
  imports. `Landing`, `Brain`, and the `/demo` console are client. `page.tsx`/`layout.tsx` stay
  server so they can export `metadata`.
- Props crossing server→client must be **serializable**. You cannot pass a plain function prop
  (a Server Action is the one exception). Keep data fetching in the server parent, pass plain
  objects down. Pattern: `/science/page.tsx` (server, fetches) → renders a client island only for
  the interactive bits.

### A.4 Metadata + JSON-LD

Static per segment:

```tsx
import type { Metadata } from "next";
export const metadata: Metadata = { title: "…", description: "…" };
```

- Dynamic: `generateMetadata({ params }: { params: Promise<{…}> })` — Server Components only, and
  you cannot export both `metadata` and `generateMetadata` in one segment. Type page props with the
  global `PageProps<'/route'>` helper.
- `metadataBase: new URL("https://…")` belongs in the root layout to allow relative OG/canonical.
- JSON-LD (used on `/faq`, and `Organization`/`Product` on `/`): a **plain** `<script>` (not
  `next/script`), escape `<`:

```tsx
const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [/*…*/] };
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
/>
```

### A.5 Env vars

- Server secrets (`SUPABASE_SECRET_KEY`) read in Route Handlers only — never shipped to browser.
- ⚠️ `NEXT_PUBLIC_*` is **inlined at build time** and frozen at `next build`. Only static references
  are inlined (`process.env.NEXT_PUBLIC_SUPABASE_URL`), not `process.env[dynamicVar]`.
- ⚠️ `.env*` stays at **project root** (not in `src/`).

### A.6 Navigation

- ⚠️ `useRouter`, `usePathname`, `useSearchParams` import from **`next/navigation`**, not
  `next/router`. Client only.
- `<Link>` from `next/link` for internal links (lint rule `no-html-link-for-pages` bans `<a href>`
  for internal routes). `<a>` attrs pass through.
- `redirect`/`permanentRedirect` from `next/navigation` **throw** — call outside `try/catch`, no
  `return`. For event-handler nav use `router.push`.
- ⚠️ `useSearchParams()` forces client rendering to the nearest boundary — wrap consumers in
  `<Suspense>`.

### A.7 Images / lint gotchas

- `@next/next/no-img-element` — use `next/image` for `<img>`. (Brain uses `<canvas>`, fine.)
- `react/no-unescaped-entities` — use `&rsquo;` / `&mdash;` in JSX text (Landing already does).
- `no-explicit-any`, `no-unused-vars` under strict TS. 2-space indent, double quotes, semicolons.

---

## B. Canonical Arc type — `src/lib/arc.ts`

Reproduces the old `validArc`/schema exactly (from `demo/app.js`). Everything except
`timestamps` + `activation` (equal length) + a positive duration is optional and defensively
guarded. Ship this file verbatim; the `/demo` player and A/B compare both import from it.

```ts
// src/lib/arc.ts

export type Arc = {
  // --- REQUIRED for validArc() to accept the arc ---
  timestamps: number[];          // seconds, ~1 Hz, evenly spaced
  activation: number[];          // whole-cortex magnitude 0..1; MUST equal timestamps.length

  // --- duration source: duration_sec || last timestamp; must be > 0 ---
  duration_sec?: number;

  // --- descriptive / provenance ---
  video_id?: string;
  fps_arc?: number;
  feature?: "roi" | "global" | string;
  precomputed?: boolean;
  video_src?: string;            // "" | null => timer mode; non-empty URL => <video> sync mode
  claim?: {
    validated?: string;
    hypothesis?: string;
    attention_hypothesis?: string;
    affect_hypothesis?: string;
    [k: string]: string | undefined;
  };

  // --- attention weak-spot bands + callouts ---
  weak_spots?: Array<{ start: number; end: number; label: string }>;

  // --- trained-head honesty badge on the attention lane ---
  attention_badge?: string;
  attention_status?: string;     // "learned-hypothesis" => teal; anything else => red

  // --- per-lane badge/status alternative location ---
  lanes?: {
    attention?: { badge?: string; status?: string };
    valence?: { badge?: string; status?: string };
    arousal?: { badge?: string; status?: string };
  };

  // --- demoted arithmetic baseline (faint dashed under head arc) ---
  baseline?: { activation: number[] };

  // --- affect lanes ---
  affect?: {
    status?: string;
    method?: string;

    valence?: number[];          // ~[-1,1], "center" mode
    valence_lo?: number[];
    valence_hi?: number[];
    valence_badge?: string;
    valence_status?: string;

    arousal?: number[];          // ~[0,1], "bottom" mode
    arousal_lo?: number[];
    arousal_hi?: number[];
    arousal_badge?: string;
    arousal_status?: string;

    validation?: {
      dataset?: string;
      null?: string;
      n?: number | null;
      r_valence?: number | null;
      p_valence?: number | null;
      r_arousal?: number | null;
      p_arousal?: number | null;
    };

    coarse_states?: {
      labels: string[];          // e.g. ["pleasant·calm","pleasant·intense",…]
      probs: number[][];         // rows per timepoint, length labels.length, each ~sums to 1
      status?: string;
      method?: string;
    };
  };

  // set at runtime, not in the file:
  _baseline?: number[] | null;
};

// Live Supabase row (folded in by mergeLiveArcs, gated by validArc(r.arc)):
export type LiveArcRow = {
  ad_id: string;
  title?: string;
  arc: Arc;
  meta?: { dataset?: string; source?: string };
};

// Reproduce app.js validArc EXACTLY. A timestamps/activation length mismatch is REJECTED
// (it would draw a plausible-but-wrong curve).
export function validArc(d: unknown): d is Arc {
  if (!d || typeof d !== "object") return false;
  const a = d as Arc;
  if (!Array.isArray(a.timestamps) || a.timestamps.length === 0) return false;
  if (!Array.isArray(a.activation) || a.activation.length === 0) return false;
  if (a.timestamps.length !== a.activation.length) return false;
  const dur = a.duration_sec || a.timestamps[a.timestamps.length - 1] || 0;
  return dur > 0;
}

export function arcDuration(a: Arc): number {
  return a.duration_sec || a.timestamps[a.timestamps.length - 1] || 0;
}
```

**Note:** `results.example.json` (`n`, `attention_r`, `permutation_p`, `beats_baseline`, `feature`,
`null_result`, `tag`) is a **separate** schema, not consumed by the player. It informs `/science`
(section F), not the Arc player.

---

## C. Supabase migration — hand this file to the user

Save as **`supabase/schema.sql`** in the repo (old-site convention: the team does not use Supabase
CLI migrations — re-applying this whole file *is* the migration; it is fully idempotent and
converges the DB from any state). A copy already exists at the scratchpad path
`0001_soma_supabase.sql`. Give the user this exact SQL; they paste it into the Supabase SQL Editor →
Run.

```sql
-- ============================================================================
-- Soma — Supabase backend (waitlist + arcs + uploads intake + storage bucket)
-- Idempotent migration. Safe to re-run: converges the DB to this schema from
-- any state. Paste into Supabase SQL Editor → Run, or apply via your migration
-- runner. Bump the version line + log a changelog row on every change.
-- migration 0001 — schema v1 — last changed 2026-07-18
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) waitlist — early-access signups.
--    Browser writes ONLY through join_waitlist() (never a direct insert): a
--    direct anon insert + UNIQUE(email) leaks 201-vs-409, an email-enumeration
--    oracle. No anon SELECT → list is unreadable with the public key.
-- ----------------------------------------------------------------------------
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  company     text,
  source      text default 'waitlist.html',
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Drop the legacy direct-insert policy so re-running stays idempotent.
drop policy if exists "anon can join waitlist" on public.waitlist;
-- (no anon insert/select/update/delete → writable ONLY via join_waitlist(),
--  readable only with the service_role key.)

-- SECURITY DEFINER RPC — the ONLY way the browser writes a signup. Dedups
-- silently (on conflict do nothing) and returns void, so there is no
-- new-vs-duplicate signal a caller can probe.
create or replace function public.join_waitlist(
  email      text,
  company    text default null,
  source     text default 'waitlist.html',
  user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(join_waitlist.email), '') is null then
    return;                       -- nothing to insert; still report success
  end if;
  insert into public.waitlist (email, company, source, user_agent)
  values (
    lower(btrim(join_waitlist.email)),
    join_waitlist.company,
    coalesce(join_waitlist.source, 'waitlist.html'),
    join_waitlist.user_agent
  )
  on conflict (email) do nothing;
end;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; lock down and hand to anon.
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon;


-- ----------------------------------------------------------------------------
-- 2) arcs — stored ad-analysis results. Public READ (is_public = true);
--    WRITES require the service_role key (pipeline, server-side).
-- ----------------------------------------------------------------------------
create table if not exists public.arcs (
  id          uuid primary key default gen_random_uuid(),
  ad_id       text not null unique,
  title       text,
  arc         jsonb not null,          -- per-second arc: attention / valence / arousal / callouts
  meta        jsonb,                   -- model, dataset, run id, evidence tier, etc.
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.arcs enable row level security;

drop policy if exists "public can read arcs" on public.arcs;
create policy "public can read arcs"
  on public.arcs for select
  to anon
  using (is_public = true);
-- (no insert/update policy for anon → only the service_role key can write.)

create index if not exists arcs_created_idx on public.arcs (created_at desc);


-- ----------------------------------------------------------------------------
-- 3) uploads — concierge intake queue ("Upload your own ad").
--    Write-only for anon (no select) — the queue can't be scraped with the
--    public key. anon may only file a QUEUED row.
-- ----------------------------------------------------------------------------
create table if not exists public.uploads (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  filename      text,
  size_bytes    bigint,
  content_type  text,
  storage_path  text not null unique,   -- object key in the `uploads` bucket
  note          text,
  status        text not null default 'queued',   -- queued | processing | done | failed
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- Keep status within the queue lifecycle. No ADD CONSTRAINT IF NOT EXISTS for
-- CHECK, so drop-then-add for idempotency.
alter table public.uploads drop constraint if exists uploads_status_check;
alter table public.uploads
  add constraint uploads_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.uploads enable row level security;

drop policy if exists "anon can queue an upload" on public.uploads;
create policy "anon can queue an upload"
  on public.uploads for insert
  to anon
  with check (status = 'queued');
-- anon may only file a QUEUED row (client omits status → default 'queued'
-- applies → check passes). Cannot self-mark done/processing. No select/update/delete.

create index if not exists uploads_created_idx on public.uploads (created_at desc);


-- ----------------------------------------------------------------------------
-- 4) storage bucket `uploads` — raw video bytes. PRIVATE (public=false).
--    150 MB cap, video mime-types only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', false, 157286400,   -- 150 MB
  array['video/mp4','video/quicktime','video/webm','video/x-msvideo','video/x-matroska']
)
on conflict (id) do update
  set public             = excluded.public,          -- re-assert private on re-run
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anon may only INSERT (upload) under uploads/queued/ — no select/list/update/delete.
drop policy if exists "anon can upload an ad" on storage.objects;
create policy "anon can upload an ad"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads' and name like 'queued/%');
-- NOTE: allowed_mime_types matches the client-supplied Content-Type (spoofable);
-- real content validation + rate-limiting are an infra follow-up, NOT RLS.
```

**RLS model in one line:** anon (publishable key) can do exactly four things — INSERT waitlist (only
via `join_waitlist()` RPC), SELECT public arcs, INSERT an `uploads` row (status pinned `queued`),
INSERT into the `uploads` bucket under `queued/`. Nothing else. Our Phase-1 upload uses **service_role
server-side** (section D), so the two anon insert policies are defense-in-depth / Option-A
compatibility — keep them.

---

## D. Phase 1 — Upload MP4 (signed direct-to-Storage)

**Why not proxy the bytes:** Vercel serverless request bodies cap at ~4.5 MB; a 150 MB ad would 413.
So MP4 bytes **never** pass through a Next route. The browser gets a short-lived signed upload URL
from our server (minted with service_role, so **no Supabase key ships to the browser**) and PUTs the
file straight to Supabase Storage. Our functions only ever see small JSON.

### D.1 Files to create / edit

| File | Kind | Purpose |
|---|---|---|
| `src/lib/supabase.ts` | server | `serviceClient()` factory (section 0.3). |
| `src/lib/upload.ts` | shared | `MAX_UPLOAD_BYTES`, `ALLOWED_MIME`, `sanitizeName()`, `buildStoragePath()`. Pure, importable by both route and client. |
| `src/app/api/uploads/sign/route.ts` | server | `POST` → validate, mint signed upload URL. |
| `src/app/api/uploads/complete/route.ts` | server | `POST` → insert the `uploads` intake row. |
| `src/components/UploadDialog.tsx` | client | `"use client"` dialog: file input + optional email + note, runs sign → PUT → complete. Default export. |
| `src/components/Landing.tsx` | edit | Render the `UploadDialog` trigger button **under the waitlist form**. |

### D.2 Shared constants — `src/lib/upload.ts`

```ts
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB — matches bucket file_size_limit
export const ALLOWED_MIME = [
  "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska",
] as const;

// queued/{ts}-{rand6}-{safeName} — MUST stay under queued/ (storage RLS: name like 'queued/%')
export function sanitizeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "").slice(-80) || "video";
}
export function buildStoragePath(name: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `queued/${Date.now()}-${rand}-${sanitizeName(name)}`;
}
```

### D.3 `POST /api/uploads/sign`

Request (JSON):
```ts
{ filename: string; size: number; contentType: string }
```
Handler:
1. `serviceClient()`; if null → `Response.json({ error: "Uploads not configured." }, { status: 500 })`.
2. Validate: `size` is a number, `0 < size <= MAX_UPLOAD_BYTES`, `contentType` ∈ `ALLOWED_MIME`.
   On failure → `400` with a plain message ("That file is over 150 MB." / "Only video files.").
3. `const path = buildStoragePath(filename)`.
4. `const { data, error } = await supabase.storage.from("uploads").createSignedUploadUrl(path);`
   (valid ~2 h). On error → `500`.
5. Build an **absolute** URL so the client can PUT with zero deps:
   `const signedUrl = new URL(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL!).toString();`

Response (200):
```ts
{ path: string; token: string; signedUrl: string }
```

### D.4 Browser upload (inside `UploadDialog`, bytes bypass Vercel)

```ts
// 1) get a signed URL
const s = await fetch("/api/uploads/sign", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type }),
});
if (!s.ok) throw new Error((await s.json()).error ?? "Could not start upload.");
const { path, signedUrl } = await s.json();

// 2) PUT the file straight to Supabase Storage (150 MB flows here, NOT through our function)
const put = await fetch(signedUrl, {
  method: "PUT",
  headers: { "Content-Type": file.type, "x-upsert": "false" },
  body: file,
});
if (!put.ok) throw new Error("Upload failed.");

// 3) record the intake row
await fetch("/api/uploads/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: email.trim() || null,
    filename: file.name,
    size: file.size,
    contentType: file.type,
    path,
    note: note.trim() || null,
  }),
});
```

**Client-side pre-checks (before step 1), mirroring the old `initUpload`:** reject `> MAX_UPLOAD_BYTES`
("That file is over 150 MB…"), reject types not in `ALLOWED_MIME`, and if an email is entered
validate `^[^@\s]+@[^@\s]+\.[^@\s]+$` (email is optional). Show status text in the dialog.

**Implementation note (verify once against the live Storage endpoint):** a plain `PUT` to `signedUrl`
uses the token embedded in the URL's query string — no `apikey`/`Authorization` header needed. If the
running project rejects it, the drop-in fallback is `Authorization: Bearer ${token}` on the PUT, or
use `supabase.storage.from("uploads").uploadToSignedUrl(path, token, file)` from a browser
`@supabase/supabase-js` client. Prefer the keyless PUT.

### D.5 `POST /api/uploads/complete`

Request (JSON): `{ email, filename, size, contentType, path, note }`.
Handler: `serviceClient()`, then insert (service_role bypasses RLS, so `status` defaults to
`queued`):
```ts
const { error } = await supabase.from("uploads").insert({
  email: email || null,
  filename: filename || null,
  size_bytes: typeof size === "number" ? size : null,
  content_type: contentType || null,
  storage_path: path,               // UNIQUE
  note: note || null,
  user_agent: request.headers.get("user-agent"),
});
if (error && error.code !== "23505") {  // ignore duplicate storage_path, exactly like waitlist route
  return Response.json({ error: "Could not queue upload." }, { status: 500 });
}
return Response.json({ ok: true });
```

### D.6 Button placement in `Landing.tsx`

Add a secondary, quieter affordance directly **under the waitlist form / the "You're on the list"
block** (inside the right-hand `w-[min(400px,42vw)]` column, after the `{submitted ? … : <form…>}`
block). Keep the existing inline-Tailwind idiom; do not introduce `style={}`, CSS modules, or
`clsx`. Example trigger row:

```tsx
<div className="mt-4 max-w-[360px] text-[13px] text-[#4a4a4a]">
  Have an ad already?{" "}
  <button
    type="button"
    onClick={() => setUploadOpen(true)}
    className="cursor-pointer font-medium text-[#0a0a0a] underline underline-offset-2 hover:text-[#333]"
  >
    Upload an MP4
  </button>{" "}
  and we&rsquo;ll analyze it.
</div>
<UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
```

`UploadDialog` owns its own `useState` for the picked file / email / note / status / pending. It is a
sibling client component (import `./UploadDialog`). Copy stays honest ("we'll analyze it" = concierge
queue, not instant). No `<a href>` — this is a button.

---

## E. Phase 5 — Brain redesign (`Brain.tsx` rewrite + one `Landing.tsx` change)

Goal: **infinite angular turntable** driven by an unbounded scroll accumulator, **10–12 regions** on
an even azimuthal ring, **2–3 regions bloom at once**, a **working EffectComposer/UnrealBloom** with
**zero black-flash**, and **frame-rate-independent (dt) damping**. Files stay client-only; keep
`"use client"`. No Next server surface is touched. Assets already served: `/brain/fs6_pos.bin`,
`/brain/fs6_idx.bin`.

### E.0 Bloom gating decision (make this call before coding)

Bloom is *added light* — it only reads against darkness; a glow over pure white clips to white and
disappears. So the area behind the brain must be dark **inside the render**. Two recipes:

- **Recommended (keep the white editorial page):** add a **fullscreen dark radial-vignette quad** to
  the 3D scene — dark (`~vec3(0.02,0.025,0.04)`) in the center where the brain sits, `alpha → 0`
  toward the right edge. `depthWrite:false`, `depthTest:false`, `renderOrder:-1`, drawn first. This
  darkens only the left ~2/3 within the canvas; the right stays transparent → white page + text show
  through.
- **Simpler bulletproof (dark hero):** opaque dark canvas (`alpha:false`,
  `setClearColor(0x06070a,1)`) + light overlay text. Only if the team accepts a dark hero.

Ship the recommended variant unless the decision-maker chooses the dark hero.

### E.1 (a) Smoother — dt damping, continuous rotation

1. Add `const clock = new THREE.Clock();`. In `frame()`: `const dt = Math.min(clock.getDelta(), 0.05);`
   (clamp guards tab-switch spikes — this clamp is also part of the anti-flash guarantee).
2. Replace `progress += (target - progress) * 0.08;` with:
   ```ts
   const K = 7; // 1/sec; 5 glidey … 10 snappy
   progress += (target - progress) * (1 - Math.exp(-dt * K));
   if (Math.abs(target - progress) < 1e-4) progress = target;
   ```
   `target = progressRef.current ?? 0` — now **unbounded** (see E.4).
3. **Delete `STOPS`, `applyScroll`'s segment logic, and the per-segment `smoothstep`.** Rotation is a
   pure continuous function of `progress`:
   ```ts
   const TAU = Math.PI * 2;
   const ROT_PER_UNIT = TAU;          // one full turntable per 1.0 accumulated progress
   rotator.rotation.z = progress * ROT_PER_UNIT;
   rotator.rotation.x = -0.15;        // constant crown tilt → no velocity jump
   ```
   Angular velocity is continuous everywhere (linear-in-progress × exp-damped progress). Remove
   `lerp`/`smoothstep` helpers if unused after the rewrite.

### E.2 (b) Longer + infinite — even ring, angular activation, wide window

1. `const N = 12;` (10–12). Remove hand-placed `REGIONS`/`STOPS`; generate an even azimuthal ring
   about superior (+z):
   ```ts
   const RING = Array.from({ length: N }, (_, i) => {
     const th = (i / N) * TAU;
     return {
       theta: th,
       center: new THREE.Vector3(0.62 * Math.cos(th), 0.92 * Math.sin(th), -0.05),
       a: new THREE.Color().setHSL(i / N, 0.85, 0.62),
       b: new THREE.Color().setHSL((i / N + 0.06) % 1, 0.9, 0.5),
     };
   });
   ```
   Radii `0.62 (x, L-R) / 0.92 (y, post-ant)` hug the lateral surface. Resize uniform arrays
   `uRegion`/`uColorA`/`uColorB`/`uAct` to length `N`; set shader `#define NREG ${N}`.
2. Activation from **angular proximity to front**, not a scroll index. Front is azimuth `π/2` in
   rotator-local space:
   ```ts
   const FRONT = Math.PI / 2;
   const alpha = progress * ROT_PER_UNIT; // = rotator.rotation.z
   const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x)); // → (-π, π], seamless
   const acts = uniforms.uAct.value as number[];
   for (let i = 0; i < N; i++) {
     const d = wrapPi(RING[i].theta + alpha - FRONT);
     acts[i] = activationWindow(d);
   }
   ```
   (If blooms run the wrong way, use `RING[i].theta - alpha`.) Everything is `mod 2π` via `wrapPi`, so
   region `i` re-blooms every full turn — no start, no end, no clamp.
3. Wide, C1, periodic window so 2–3 glow at once:
   ```ts
   const HALF = 1.4 * TAU / N; // half-width ~1.4 region-gaps each side
   function activationWindow(d: number) {
     const t = Math.min(Math.abs(d) / HALF, 1);
     return 0.5 * (1 + Math.cos(t * Math.PI)); // raised cosine, peak 1 at d=0, C1 at edges
   }
   ```

### E.3 (c) More lighting + working bloom (no black flash)

Imports (r0.185, `.js` extension required; `three/addons/…` alias also resolves):
```ts
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
```

**Brighten the fill so glow exceeds threshold.** In `FRAG`, after computing `col`/`a`:
```glsl
float core = pow(clamp(a, 0.0, 1.0), 2.0);
col *= (1.0 + 1.8 * core);                 // emissive gain at the hot core
gl_FragColor = vec4(col, clamp(a * 1.4, 0.0, 0.95));
```
Keep the weighted-average blend (`col /= max(a, …)`) so overlapping active regions mix cleanly.

**Add the dark stage** (E.0 recommended quad) so bloom reads while the page stays white on the right.

**Two-composer, transparency-reconstructed setup (the whole anti-flash fix):**
```ts
renderer.autoClear = false;                 // each RenderPass clears explicitly; no stale buffer
renderer.setClearColor(0x000000, 0);        // canvas transparent for the page

// 1) BLOOM composer — scene → OPAQUE (clearAlpha=1) HDR target. Opaque = flash is impossible.
const bloomComposer = new EffectComposer(renderer); // r185 targets default to HalfFloatType
bloomComposer.renderToScreen = false;
const bloomRender = new RenderPass(scene, camera);
bloomRender.clearColor = new THREE.Color(0x000000);
bloomRender.clearAlpha = 1;                 // <-- OPAQUE clear
bloomComposer.addPass(bloomRender);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.6); // strength, radius, threshold
bloomComposer.addPass(bloomPass);

// 2) FINAL composer — scene again (transparent clear) + mix pass rebuilds alpha as coverage.
const finalComposer = new EffectComposer(renderer);
const baseRender = new RenderPass(scene, camera);
baseRender.clearColor = new THREE.Color(0x000000);
baseRender.clearAlpha = 0;                  // base keeps real transparency
finalComposer.addPass(baseRender);
const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: {
    baseTexture: { value: null },           // ShaderPass fills this from the read buffer
    bloomTexture: { value: bloomComposer.renderTarget2.texture },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    void main(){
      vec4 base  = texture2D(baseTexture,  vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      float bl = dot(bloom, vec3(0.2126,0.7152,0.0722)); // bloom luminance = extra coverage
      gl_FragColor = vec4(base.rgb + bloom, clamp(max(base.a, bl), 0.0, 1.0));
    }`,
}), "baseTexture");
finalComposer.addPass(mixPass);
finalComposer.addPass(new OutputPass());    // tone-map + colorspace, final blit
```
Render loop: replace `renderer.render(scene,camera)` with `bloomComposer.render(); finalComposer.render();`.

**Why no black flash** (put this as a code comment, no attribution): bloom runs only on the opaque
target so it never touches ambiguous `(…,0)` pixels; `autoClear=false` + explicit clears mean no
frame samples an uncleared ping-pong buffer; canvas alpha is reconstructed deterministically by
`mixPass` as `max(base coverage, bloom luminance)` — a pure function of this frame, it can't
oscillate; HDR `HalfFloatType` + `OutputPass` keep color correct without an opaque black background.

**Resize:** also `bloomComposer.setSize(w,h)`, `finalComposer.setSize(w,h)`, `bloomPass.resolution.set(w,h)`.
**Dispose:** add `bloomComposer.dispose()`, `finalComposer.dispose()`, `bloomPass.dispose()` to
cleanup. Cap `renderer.setPixelRatio(Math.min(dpr, 2))` (bloom is fill-rate heavy; consider 1.5 on
coarse pointers).

**Tuning knobs to expose:** strength 0.7–1.2, radius 0.4–0.6, threshold 0.5–0.7, emissive gain
1.5–2.2, `HALF` (2–3 active).

### E.4 (d) `Landing.tsx` — unbounded accumulator

Replace the clamped setter with an unbounded accumulator (Brain's exp damping smooths it downstream).
Delete `clamp` and the `setProgress` wrapper. Keep the wheel + touch listeners otherwise identical.

```ts
useEffect(() => {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    progressRef.current += e.deltaY * 0.0007;   // no clamp → infinite
  };
  let lastTouch: number | null = null;
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    if (lastTouch != null) progressRef.current += (lastTouch - y) * 0.0018;
    lastTouch = y;
  };
  const onTouchEnd = () => { lastTouch = null; };
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
  };
}, []);
```
- `progressRef` stays `useRef(0)` (number); Brain's prop type `RefObject<number>` unchanged.
- Negative accumulation (scroll up) spins the other way — periodic activation stays seamless.
- **Do not** modulo-wrap `progressRef` itself (a wrap injects a velocity spike into the damper);
  `double` is safe for hours. If ever needed, wrap only the *displayed* angle:
  `rotator.rotation.z = (progress * ROT_PER_UNIT) % TAU`.
- Optional idle drift ("turntables forever"): add `progressRef.current += 0.02 * dt` per frame in
  Brain's loop. Default off to match the original "nothing animates on its own" ethos.

### E.5 Verification checklist
- No per-segment `smoothstep` remains; angular velocity visually continuous through every hand-off
  (flick the wheel then stop — no snap).
- Scroll never stops advancing; regions re-bloom on a seamless loop with 2–3 lit at once.
- Bloom visibly glows on the dark stage; **zero** black frames on flick-scroll or tab refocus.
- Right text column stays on white (canvas transparent there); brain sits on the dark vignette.
- `bloomComposer`/`finalComposer`/`bloomPass` are resized and disposed with the component.

---

## F. Later waves — file-level task lists

Player + content live on their own routes (§0.1). All import the Arc type/`validArc` from
`@/lib/arc`. Reference the old behavior via `git -C "<repo>" show muki/oldlandingpage:demo/app.js`
(and `demo/index.html`, `demo/supabase.js`).

### F.1 Phase 2 — Arc player at `/demo`

The single-screen console: `#brainSvg` brain + 4 canvas lanes + transport + video/sample picker. In
React drive **all** canvases from one shared time (`useRef` updated by a single rAF loop in an
effect); each canvas is its own `useRef`. Port math verbatim from `app.js` (report 2 §2–§4).

| File | Purpose |
|---|---|
| `src/app/demo/page.tsx` | Server component. `export const metadata`. Renders `<DemoConsole/>`. Fixed-viewport (no scroll wrapper). |
| `src/components/demo/DemoConsole.tsx` | `"use client"` root. Owns `arc` state, `timeRef`, `playing`, the single rAF loop + IntersectionObserver(`#console`, threshold 0) + `visibilitychange` gating + single-loop guard (`loopRunning`, `loopActive()`), and `failed`/`bail()`. Lays out brain + lanes + transport + picker. |
| `src/components/demo/BrainSvg.tsx` | `<svg>` built once (`setupBrain` + `meshDots()` deterministic grid + `CORTEX_PATH`/3 `SULCI` copied verbatim from app.js lines 65–70). Per frame only sets attrs: shell fill `rgba(143,179,192, 0.05 + a*0.1)`, glow opacity `a*0.35`, mesh opacity `0.12 + a*0.8`, colorbar mark `176 - a*120`, `mag`/`pk`/`brainT` text. `a = clamp01(valAt(activation,t))`, whole mesh warms uniformly. (Note: this is the *player* brain — the SVG activation readout — separate from the Phase-5 hero WebGL `Brain.tsx`.) |
| `src/components/demo/lanes/Attention.tsx` | `cAtt` 720×150, `top=14 bot=128`. drawGrid `[1,0.5,0]` → weak-spot bands `rgba(255,122,122,0.09)` → area fill → dashed baseline (only if `_baseline.length===xs.length`) → ice-line gradient `#8FB3C0→#EAF6FA→#8FB3C0` (shadowBlur 9) → peak marker → playhead → current dot → drawStats. Plus `#callout` under it (`activeWeakSpot(t)`, warning-triangle SVG). |
| `src/components/demo/lanes/Signed.tsx` | Reusable `drawSigned` for valence (`cVal` 720×120, mode `center`, `[+1,0,-1]`, color `rgba(234,244,255,COLOR)`) and arousal (`cAro` 720×120, mode `bottom`, `[1,0.5,0]`, color `rgba(143,179,192,COLOR)`): baseline line, uncertainty band (`lo`&`hi`), curve, playhead, current dot, drawStats. |
| `src/components/demo/lanes/Coarse.tsx` | `cCoarse` 720×96, `top=6 bot=90`, hidden unless `hasCoarse`. Stacked cumulative bands, `coarseColor(i,n)=hsl(202 24% ${38 + i/max(1,n-1)*46}%)`, `globalAlpha 0.82`, legend `<i>` swatches. |
| `src/components/demo/Transport.tsx` | `#playBtn` `#scrub` `#clock`. Two clock sources by `hasVideo`: video mode (`video.currentTime`, button driven by native `onplay/onpause/onended`) vs timer mode (`timerBase`+`performance.now()`). `seek`, `setPlaying`, `fmt(s)=floor(s/60)+":"+String(s%60).padStart(2,"0")`. Lane click → `seek((clientX-rect.left)/rect.width*duration)`. |
| `src/components/demo/Picker.tsx` | `VIDEOS` seed (real1 `arcs/real_esJrBWj2d8.json`, real2, real3, hero1 `sample_arc.json`, hero2, hero3). `renderVids`, `paintThumb` (FNV-1a `hashStr` → mulberry32 `seeded` → 7 pts → 61-step smoothstep sparkline), `pickVideo`, `updateCardDur`. **Boots on `real1`** (never synthetic). Sample watermark: `isSample = /sample/i.test(v.src) || v.id !== "real1"` → amber "◆ ILLUSTRATIVE SAMPLE" pill. |
| `src/lib/arc-draw.ts` | Pure helpers shared by lanes: `PADL=30`, `PADR=12`, `xAt`, `valAt` (uniform linear interp), `sampleAt(arc,u)` (u∈[0,1]), `statOf`, `computeStats`, `clamp01`, `drawGrid`, `timeTicks`, `fmt`, `drawStats`, `playhead`, `setLaneBadge`/`setHeadBadge` (status `"learned-hypothesis"` → teal `#8FB3C0`, else red `#ff9a9a`). |

Copy the arc JSONs into `public/arcs/` (fetched by URL) or inline the hero ones. `duration` =
`duration_sec || timestamps.at(-1)`. rAF loop `try/catch` warns once (`loopErrLogged`), never kills
the chain. **Not** gated on `prefers-reduced-motion` (it's the user's own playback UI).

### F.2 Phase 3 — A/B compare + live Supabase arcs (inside `/demo`)

| File | Purpose |
|---|---|
| `src/components/demo/Compare.tsx` | `#cmpA` `#cmpB` selects + `#cmpCanvas` 1040×210 + `#cmpLegend` `#cmpSummary`. `getArc(id)` cache memoizes **successes only** (evict on reject so a retry re-fetches). `sampleAt(arc,u)` resamples both on normalized 0..1 so different-duration clips overlay. `render()`: `Promise.all([getArc(A),getArc(B)])`; draw B first dashed `[6,5]` `#BFE0EC`, then A solid `#EAF6FA`; "who leads" strip (N=120 bins, A-leads height 9 bright vs B-leads height 4 dim — differ by height AND luminance); summary "A holds higher predicted attention **pa%**…" (`pa=round(100*aWins/N)`), or "Pick two different ads" if A===B, or "Could not load one of the arcs." on `.catch`. |
| `src/app/api/arcs/route.ts` | `GET` (dynamic by default). `serviceClient()` → `select("ad_id,title,arc,meta").order("created_at",{ascending:false})` from `arcs`. Return `Response.json(rows)`. Server-side keeps Supabase creds off the client (the new-app convention). Client fetches `/api/arcs` instead of hitting PostgREST directly. |
| `src/components/demo/live.ts` | `mergeLiveArcs`: fetch `/api/arcs`, gate each row with `validArc(r.arc)`, dedupe by `ad_id`, **append** (never unshift) as `{ id, title, src:"live · "+tag, arcData, grad:gradFor(id) }`, re-render picker, call `refreshCompare()`, restore `markActive(currentId)`. `gradFor(id)`: char-sum hash → `hue=188+(h%42)` teal band. |

`refreshCompare = () => { fillOpts(); render(); }` runs after the live merge. `fillOpts` populates both
selects from `VIDEOS`, preserving prior A/B (defaults A→0, B→min(1,len-1)).

### F.3 Phase 4 — Content pages (under `src/app/(site)/`, scroll wrapper from §0.1)

All are **Server Components** (export `metadata`); push any interactivity into small client islands.

| File | Purpose |
|---|---|
| `src/app/(site)/layout.tsx` | Scroll wrapper `<main className="fixed inset-0 overflow-y-auto bg-white">{children}</main>` so these routes scroll despite the global `overflow:hidden`. Shared top nav / `soma` wordmark + `<Link>`s back to `/` and to siblings. |
| `src/app/(site)/science/page.tsx` | **ad_backtest hydration.** Server component, read at **request time** (Cache Components is OFF → no `use cache`; just fetch in the async component, or set `export const revalidate = 300` for light ISR). Source = the `ad_backtest` data (a Supabase table/view or the pipeline's `results.json`-shaped rows; confirm source with the user). Read server-side via `serviceClient()` (or public `arcs` read), then render the honesty strip: `n`, `attention_r`, `permutation_p`, `beats_baseline`, `feature`, `null_result`, `tag` (aliases `n_videos`/`r`/`p`). Show null results honestly — do not hide `null_result:true`. No client JS needed unless a chart is interactive. |
| `src/app/(site)/compare/page.tsx` | Marketing comparison (soma vs survey/panel/A-B-in-market). Static server content; a client island only if a toggle/tab is interactive. **Distinct** from the `/demo` A/B canvas. |
| `src/app/(site)/faq/page.tsx` | FAQ content + **`FAQPage` JSON-LD** via a plain escaped `<script type="application/ld+json">` (A.4). Keep the visible Q&A and the JSON-LD `mainEntity` in sync (drive both from one array). |
| `src/app/(site)/pitch/page.tsx` | Investor/pitch narrative. Static server content; can reuse `docs/GTM` / `docs/strategy` copy. `export const metadata` with `robots: { index: false }` if it should stay unlisted. |

**Conventions for all Phase-4 pages (report 5):** 100% inline Tailwind utilities with arbitrary
values (`text-[clamp(...)]`, raw hex like `text-[#4a4a4a]`), no CSS modules / no `style={}` / no
`clsx`; HTML entities in JSX text (`&rsquo;`, `&mdash;`); `next/link` for internal nav, `next/image`
for images; serif via the `font-serif` utility for editorial accents; brand face is "GT Planar" via
the `@theme inline` CSS var (no `next/font`). Single light look — no dark mode. `@/*` for cross-tree
imports, `./` for siblings.

---

## Appendix — conventions checklist (every phase)

- `"use client"` only when hooks/browser APIs are needed; keep `page.tsx`/`layout.tsx` server.
- Components: `src/components/<Name>.tsx`, PascalCase, **default export**.
- Routes: `src/app/<route>/page.tsx`; handlers: `src/app/api/<name>/route.ts` (Web `Request`/`Response`).
- Shared code: `src/lib/<name>.ts`, imported via `@/lib/...` (this repo establishes `src/lib`).
- Tailwind v4 inline utilities only; arbitrary values in `[]`; raw hex, not theme tokens.
- TS strict: no `any`, no unused symbols. 2-space indent, double quotes, semicolons. `pnpm/npm lint`
  (`eslint`) must pass — watch `no-unescaped-entities`, `no-img-element`, `no-html-link-for-pages`.
- Supabase: server-side only, `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`, auth options
  disabled, tolerate `error.code === "23505"`.
- **Never** enable Cache Components / `use cache` in these phases (config is empty on purpose).
- Do not touch `data/`, Python/ML files, `main`, or `muki/oldlandingpage`. No AI/Claude attribution
  anywhere.
