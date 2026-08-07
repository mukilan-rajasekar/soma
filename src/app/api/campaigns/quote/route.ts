// POST /api/campaigns/quote
//
// Turns a campaign brief into the one all-inclusive weekly price, and freezes both.
//
// SHAPE OF THE FLOW. The browser has already shown a live preview by running the same
// pricing module locally; this route is the call that makes it real. It authenticates the
// user, checks the brand through RLS, prices the brief through src/lib/pricing.ts, and
// writes two rows with service_role: the brief (what was asked for, in the advertiser's
// terms) and the quote (what we answered, frozen verbatim so it can be audited after the
// pricing constants move). Migration 0016 makes the campaign tables SELECT-only for
// browsers, so this route is the only door a priced campaign can enter through.
//
// THE CLIENT NEVER SENDS A MARGIN. The spec handed to quote() is rebuilt field by field,
// and margin_pct is deliberately not one of the fields: the server always prices at the
// default. A browser that could choose its own margin would be choosing its own price,
// so a margin in the body is ignored rather than validated.

import { quote, type Quote, type QuoteSpec } from "@/lib/pricing";
import { getBrand } from "@/lib/serve";
import { serviceClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";

type Incoming = {
  brandId?: unknown;
  platforms?: unknown;
  weekly_spend_micros?: unknown;
  goal?: unknown;
  duration_weeks?: unknown;
  reach_note?: unknown;
};

export async function POST(request: Request) {
  // A quote is priced for a brand the caller belongs to, so an anonymous request has
  // nothing this route could legitimately do with it.
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Sign in to price a campaign." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Incoming;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Campaigns are not configured." }, { status: 500 });
  }

  // ── the brand ────────────────────────────────────────────────────────────────
  // getBrand() reads through the session client, so brand_members — not this route —
  // decides whether the brand exists for this caller. A brand the user does not belong
  // to is indistinguishable from one that was never created.
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const brand = brandId ? await getBrand(brandId) : null;
  if (!brand) {
    return Response.json({ error: "brand not found" }, { status: 400 });
  }

  // ── the price ────────────────────────────────────────────────────────────────
  // Rebuilt onto a known-shaped spec rather than spread from the request: an unknown
  // key must not survive into the pricing call, and margin_pct must not exist here at
  // all (see the header). quote() throws on anything unpriceable; its message is the
  // 400 body because it already names the field in the advertiser's terms.
  const spec: QuoteSpec = {
    platforms: Array.isArray(body.platforms)
      ? body.platforms.filter((p): p is string => typeof p === "string")
      : [],
    weekly_spend_micros:
      typeof body.weekly_spend_micros === "number" ? body.weekly_spend_micros : 0,
    goal: typeof body.goal === "string" ? body.goal : "",
    duration_weeks: typeof body.duration_weeks === "number" ? body.duration_weeks : null,
  };

  let priced: Quote;
  try {
    priced = quote(spec);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not price this brief." },
      { status: 400 },
    );
  }

  const reachNote =
    typeof body.reach_note === "string" && body.reach_note.trim()
      ? body.reach_note.trim()
      : null;

  // ── write ────────────────────────────────────────────────────────────────────
  // Brief first, quote second, both from the priced output rather than the raw body so
  // the stored brief is exactly what was priced. status goes straight to 'quoted' — a
  // 'draft' brief is a shape this route never produces, because it never answers
  // without a quote.
  const { data: brief, error: briefError } = await supabase
    .from("campaign_briefs")
    .insert({
      brand_id: brand.id,
      user_id: user.id,
      platforms: priced.platforms.map((p) => p.platform),
      goal: priced.goal,
      weekly_spend_micros: priced.weekly_spend_micros,
      currency: priced.currency,
      duration_weeks: priced.duration_weeks,
      reach_note: reachNote,
      status: "quoted",
    })
    .select("id")
    .single();

  if (briefError || !brief) {
    return Response.json({ error: "Could not save this brief." }, { status: 500 });
  }

  const { data: saved, error: quoteError } = await supabase
    .from("campaign_quotes")
    .insert({
      brief_id: brief.id,
      brand_id: brand.id,
      weekly_spend_micros: priced.weekly_spend_micros,
      margin_pct: priced.margin_pct,
      margin_micros: priced.margin_micros,
      weekly_price_micros: priced.weekly_price_micros,
      currency: priced.currency,
      platform_split: priced.platforms,
      playbook: priced.playbook,
      status: "quoted",
      valid_until: null,
    })
    .select("id")
    .single();

  if (quoteError || !saved) {
    // A 'quoted' brief with no quote row would sit in the dashboard as a permanent
    // puzzle. Delete it so a retry is clean rather than leaving a half-written
    // campaign for someone to diagnose later — same compensating write as
    // /api/batches/create.
    await supabase.from("campaign_briefs").delete().eq("id", brief.id);
    return Response.json({ error: "Could not save this quote." }, { status: 500 });
  }

  return Response.json({ ok: true, briefId: brief.id, quoteId: saved.id, quote: priced });
}
