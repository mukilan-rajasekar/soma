// POST /api/brands/create
//
// The self-serve door into brand_members. Migration 0011 kept brand creation a
// service_role operation "until there is a UI and an approval flow for it" — this route
// and CreateBrandForm are that UI. The invariant it preserves is the one every write in
// this app follows: RLS stays SELECT-only, the write happens with service_role AFTER an
// explicit check of who is asking, and the caller becomes visible to themselves through
// the same brand_members EXISTS every reader already uses.
//
// IDEMPOTENT ON THE NAME, capped at three. A double-click must not mint two brands, so a
// case-folded match against the caller's existing brands answers `created: false` with
// the existing row instead of inserting. The cap is an abuse valve, not a plan limit —
// nothing else in the schema cares how many brands a user owns. There is deliberately no
// unique index behind this: two different customers may legitimately run brands that
// share a name; only *this caller's* names are deduplicated.
//
// CONSENT IS AN OPT-IN, RECORDED WITH ITS PROVENANCE. training_consent turns on only for
// a literal `true`, and lands with training_consent_source/at so a later audit can say
// where the yes came from (Meta Developer Policy 10.7 is why the column exists at all).

import { serviceClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";

const MAX_BRANDS_PER_USER = 3;
const MAX_NAME_LENGTH = 80;

type Incoming = {
  name?: unknown;
  trainingConsent?: unknown;
};

export async function GET() {
  return Response.json(
    { error: "Use POST. Brands are read through the dashboard loaders." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  // A brand belongs to whoever creates it, so an anonymous request has nothing this
  // route could legitimately do with it.
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Sign in to create a brand." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Incoming;

  const raw = typeof body.name === "string" ? body.name : "";
  const name = raw.trim().replace(/\s+/g, " ");
  // Control characters have no place in a name that renders across three dashboards.
  const hasControl = [...name].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  if (!name || hasControl) {
    return Response.json({ error: "Give the brand a name." }, { status: 400 });
  }
  if (name.length < 2) {
    return Response.json({ error: "Use at least two characters." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return Response.json(
      { error: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const trainingConsent = body.trainingConsent === true;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Brands are not configured." }, { status: 500 });
  }

  // ── what the caller already has ──────────────────────────────────────────────
  // One membership read serves both the idempotency check and the cap. Errors here are
  // 500s, not empty lists: treating a failed read as "no brands" would let a Postgres
  // hiccup blow through the cap.
  const { data: memberships, error: memberError } = await supabase
    .from("brand_members")
    .select("brand_id")
    .eq("user_id", user.id);

  if (memberError) {
    return Response.json({ error: "Could not create this brand." }, { status: 500 });
  }

  const brandIds = (memberships ?? []).map((m) => (m as { brand_id: string }).brand_id);
  if (brandIds.length > 0) {
    const { data: existing, error: existingError } = await supabase
      .from("brands")
      .select("id, name, training_consent")
      .in("id", brandIds);

    if (existingError) {
      return Response.json({ error: "Could not create this brand." }, { status: 500 });
    }

    const rows = (existing ?? []) as { id: string; name: string; training_consent: boolean }[];
    const match = rows.find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (match) {
      return Response.json({
        ok: true,
        created: false,
        brand: { id: match.id, name: match.name, trainingConsent: match.training_consent },
      });
    }

    if (rows.length >= MAX_BRANDS_PER_USER) {
      return Response.json(
        {
          error: `${MAX_BRANDS_PER_USER} brands is the self-serve limit. Reply to any Soma email and we'll add more.`,
        },
        { status: 409 },
      );
    }
  }

  // ── the write ────────────────────────────────────────────────────────────────
  // Brand first, membership second. A brand without its owner's membership row is
  // invisible to everyone forever, so the failure path deletes it — same compensating
  // write as /api/campaigns/quote.
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .insert({
      name,
      training_consent: trainingConsent,
      training_consent_source: trainingConsent ? "self_serve_dashboard_v1" : null,
      training_consent_at: trainingConsent ? new Date().toISOString() : null,
    })
    .select("id, name, training_consent")
    .single();

  if (brandError || !brand) {
    return Response.json({ error: "Could not create this brand." }, { status: 500 });
  }

  const { error: ownerError } = await supabase.from("brand_members").insert({
    brand_id: brand.id,
    user_id: user.id,
    role: "owner",
  });

  if (ownerError) {
    await supabase.from("brands").delete().eq("id", brand.id);
    return Response.json({ error: "Could not create this brand." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    created: true,
    brand: { id: brand.id, name: brand.name, trainingConsent: brand.training_consent },
  });
}
