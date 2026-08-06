// auth-redirect.ts — the `?next=` parameter, made safe.
//
// An open redirect is the classic bug in exactly this three-line feature: the sign-in page
// takes a destination from the query string and sends the browser there afterwards, so
// `/sign-in?next=https://evil.example/login` produces a phishing page that a user reached
// by clicking a genuine usesoma.work link and that carries our domain in the referrer.
//
// The rule below is deliberately a strict allowlist rather than a blocklist of bad shapes:
// one leading slash, no second slash, no backslash, no scheme. `//evil.example` is a
// protocol-relative URL that browsers happily treat as off-site, and it is the case a
// naive `startsWith("/")` check waves straight through.

/** The default landing spot for a freshly authenticated session. */
export const AFTER_AUTH = "/dashboard";

/**
 * A `?next=` value that is safe to redirect to, or AFTER_AUTH.
 *
 * Accepts only same-origin absolute paths: "/dashboard", "/dashboard/v/abc?tab=edits".
 * Rejects absolute URLs, protocol-relative URLs, and backslash variants of both.
 */
export function safeNext(next: string | undefined | null): string {
  if (typeof next !== "string" || next.length === 0) return AFTER_AUTH;
  if (next[0] !== "/") return AFTER_AUTH;
  if (next[1] === "/" || next[1] === "\\") return AFTER_AUTH;
  if (next.includes("\\")) return AFTER_AUTH;
  return next;
}
