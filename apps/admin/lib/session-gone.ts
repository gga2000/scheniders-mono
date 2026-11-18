import { isAuthApiError } from "@supabase/supabase-js";

/**
 * The auth server's answers that mean "this session is gone": an idle tab
 * whose session ended elsewhere (sign out everywhere, a password change) or
 * by the 16-hour rule. The middleware answers them as signed out, which is
 * right, but auth-js also logs the refused refresh with console.error, and
 * the server's console capture made each one a Sentry error (round 15,
 * SCHENIDERS-1F). Any other auth error still reaches Sentry.
 */
const SESSION_GONE: ReadonlySet<string> = new Set(["refresh_token_not_found", "session_not_found"]);

export function isSessionGone(error: unknown): boolean {
  return isAuthApiError(error) && SESSION_GONE.has(error.code ?? "");
}

/** A Sentry beforeSend that drops "this session is gone" and hands every other event to `beforeSend`. */
export function dropSessionGone<E>(
  beforeSend: (event: E) => E,
): (event: E, hint: { originalException?: unknown }) => E | null {
  return (event, hint) => (isSessionGone(hint.originalException) ? null : beforeSend(event));
}
