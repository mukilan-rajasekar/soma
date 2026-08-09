// POST /api/campaigns/quote/accept
//
// Records an advertiser's yes to a price. That is ALL it does, and the restraint is the
// point: PLAN.md licence gate 4 is unresolved, so nothing that says "you now owe money"
// may exist. Accepting flips campaign_quotes.status from 'quoted' to 'accepted' — a
// status 0016 already allows — and deliberately does NOT create a campaign_subscriptions
// row. A subscription is scheduling truth that renewals advance, and an 'active' one
// minted by a browser click would be a bill in waiting. When the gate resolves, the
// accepted quotes are exactly the list to start from.
//
// COMPARE-AND-SET, not read-then-write. The update matches on status='quoted', so two
// tabs racing produce one transition and one "already accepted" answer, and an expired
// quote cannot be revived into an accepted one.
//
// A quote the caller cannot see answers 404 "quote not found" — indistinguishable from
// one that never existed, same posture as /api/serve/actions.

import { serviceClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";

type Incoming = {
  quoteId?: unknown;
};

export async function GET() {
  return Response.json(
    { error: "Use POST. Quotes are read through the dashboard loaders." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  // An acceptance is a named person's decision about their brand's money, so an
  // anonymous request has nothing this route could legitimately do with it.
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Sign in to accept a price." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const quoteId = typeof body.quoteId === "string" ? body.quoteId.trim() : "";
  if (!quoteId) {
    return Response.json({ error: "quoteId is required." }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Campaigns are not configured." }, { status: 500 });
  }

  // ── the quote, and whether it is theirs ──────────────────────────────────────
  // A malformed uuid errors inside Postgres rather than in application code; that error
  // collapses into the same "quote not found" as a missing row, which is the point.
  const { data: quoteRow, error: quoteError } = await supabase
    .from("campaign_quotes")
    .select("id, brand_id, status")
    .eq("id", quoteId)
    .maybeSingle();

  const found = quoteRow as { id: string; brand_id: string; status: string } | null;
  if (quoteError || !found) {
    return Response.json({ error: "quote not found" }, { status: 404 });
  }

  const { data: membership, error: memberError } = await supabase
    .from("brand_members")
    .select("brand_id")
    .eq("brand_id", found.brand_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !membership) {
    return Response.json({ error: "quote not found" }, { status: 404 });
  }

  if (found.status === "expired") {
    return Response.json(
      { error: "This quote has expired. Price a new campaign." },
      { status: 409 },
    );
  }

  if (found.status === "accepted") {
    return Response.json({ ok: true, quoteId, status: "accepted", alreadyAccepted: true });
  }

  // ── the transition ───────────────────────────────────────────────────────────
  const { data: updated, error: updateError } = await supabase
    .from("campaign_quotes")
    .update({ status: "accepted" })
    .eq("id", quoteId)
    .eq("status", "quoted")
    .select("id");

  if (updateError) {
    return Response.json({ error: "Could not accept this quote." }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // Someone else got there between the read and the write. Re-read and answer with
    // what the row actually is now.
    const { data: after } = await supabase
      .from("campaign_quotes")
      .select("status")
      .eq("id", quoteId)
      .maybeSingle();

    const status = (after as { status: string } | null)?.status ?? null;
    if (status === "accepted") {
      return Response.json({ ok: true, quoteId, status, alreadyAccepted: true });
    }
    return Response.json(
      { error: "This quote has expired. Price a new campaign." },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, quoteId, status: "accepted", alreadyAccepted: false });
}
