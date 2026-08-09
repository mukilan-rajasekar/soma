// auth-password.ts — one password rule, stated once.
//
// Three forms set a password: sign-up (AuthForm), the recovery screen (/update-password)
// and the account page. A private const inside one component is how two of the three
// drift to different numbers, so the minimum and the sentence that explains a rejection
// live here and everywhere imports them.

/** Supabase's minimum. Stated up front rather than discovered by a rejected submit. */
export const MIN_PASSWORD = 6;

/**
 * What is wrong with an email field, as a sentence, or null when nothing is.
 *
 * Kept deliberately light: the forms use `noValidate` so we own the copy, and we would
 * rather a slightly-odd address reach Supabase than invent an RFC parser that rejects a
 * real customer. Empty and "@"-less are the cases that otherwise surface as Supabase's
 * raw "missing email or phone" — a phrase that names a field this UI does not have.
 */
export function emailProblem(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter an email address.";
  if (!trimmed.includes("@")) return "Enter a valid email address.";
  return null;
}

/**
 * What is wrong with a proposed password, as a sentence, or null when nothing is.
 * `confirm` is compared only when the caller collects one.
 */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return "The two passwords do not match.";
  }
  return null;
}
