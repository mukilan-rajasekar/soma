import { createClient } from "@supabase/supabase-js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: "" }));
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!emailPattern.test(normalizedEmail)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Waitlist is not configured." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error } = await supabase.from("waitlist").insert({
    email: normalizedEmail,
    source: "landing",
    user_agent: request.headers.get("user-agent"),
  });

  if (error && error.code !== "23505") {
    return Response.json({ error: "Could not join waitlist." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
