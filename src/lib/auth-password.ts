// auth-password.ts — one password rule, stated once.
//
// Three forms set a password: sign-up (AuthForm), the recovery screen (/update-password)
// and the account page. A private const inside one component is how two of the three
// drift to different numbers, so the minimum and the sentence that explains a rejection
// live here and everywhere imports them.

/** Supabase's minimum. Stated up front rather than discovered by a rejected submit. */
export const MIN_PASSWORD = 6;

/**
 * What is wrong with a proposed password, as a sentence, or null when nothing is.
 * `confirm` is compared only when the caller collects one.
 */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return "The two passwords do not match.";
  }
  return null;
}
