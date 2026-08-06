// The authenticated shell.
//
// requireUser() here is the boundary. src/proxy.ts already bounced signed-out visitors
// before routing, but that is an optimisation and the Next docs say so plainly — a proxy
// cannot be the authorization layer. This layout wraps every /dashboard/* segment, so
// there is exactly one place a signed-in user is established and no page below can forget
// to check.
//
// force-dynamic because every screen under here is per-user. Without it a build-time
// prerender of /dashboard would be a real possibility, and a cached render of one
// person's library is the worst bug this product could ship.

import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { requireUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soma · studio",
  // Someone's unreleased creative lives behind this. Same posture as /r/<token>.
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser("/dashboard");

  return <DashboardShell email={user.email ?? ""}>{children}</DashboardShell>;
}
