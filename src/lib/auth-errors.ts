// auth-errors.ts — Supabase's auth errors, turned into sentences we wrote.
//
// The forms used to render `error.message` straight from the client. That is how
// "missing email or phone" (a field this UI does not have) and "email rate limit
// exceeded" (an operator sentence) landed on a customer-facing page. Known codes
// and phrases map to copy; anything else becomes a generic retry line rather than
// a reflected third-party string.

import { MIN_PASSWORD } from "@/lib/auth-password";

export function authErrorMessage(
  err: { message?: string; code?: string } | string | null | undefined,
): string {
  if (!err) return "Could not complete that. Try again.";
  const raw = typeof err === "string" ? err : (err.message ?? "");
  const code = typeof err === "string" ? "" : (err.code ?? "");
  const blob = `${code} ${raw}`.toLowerCase();

  if (/missing email or phone/.test(blob)) return "Enter an email address.";
  if (/invalid.?email|email.?invalid/.test(blob) && !/credentials/.test(blob)) {
    return "Enter a valid email address.";
  }
  if (/invalid.*(login|credentials)|invalid email or password/.test(blob)) {
    return "Email or password is wrong.";
  }
  if (/email.?not.?confirmed|not.?confirmed/.test(blob)) {
    return "Confirm the address from the email we sent, then sign in.";
  }
  if (/already.?(registered|exists|been registered)|user_already_exists/.test(blob)) {
    return "That address already has an account. Sign in instead.";
  }
  if (/over_email_send|rate.?limit|too many/.test(blob)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (/password/.test(blob) && /least|short|characters|6|8/.test(blob)) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (/same.?password|should be different|different from the old/.test(blob)) {
    return "Choose a password you have not used here before.";
  }
  if (/expired|already.?used|token/.test(blob) && /otp|link|verify/.test(blob)) {
    return "That link has expired or was already used. Ask for a new one.";
  }
  if (/network|failed to fetch|fetch failed|econnrefused/.test(blob)) {
    return "Could not reach the authentication service. Try again.";
  }

  return "Could not complete that. Try again.";
}
