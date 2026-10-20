import { isAuthApiError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";

/**
 * An authentication or authorization failure — the caller's fault, not the
 * server's. `requireAdmin` / `resolveAdminRole` throw it; the route guards in
 * `api-auth.ts` turn it into the matching response:
 *   401 — no valid identity (missing, malformed, expired or revoked token)
 *   403 — a valid identity that has no active admin-console access
 *
 * Anything else those helpers throw (database or auth-server outage) is a real
 * server error and must keep propagating to a 500.
 */
export class AdminAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

/**
 * Whether a `getUser()` failure means the credential itself was rejected (→ 401)
 * rather than the auth server failing to answer. A 4xx from the auth API is a
 * verdict on the token; 429, 5xx, network and unknown errors are not, so they
 * are reported as server errors instead of telling a valid admin to sign in.
 */
export function isCredentialRejection(error: AuthError | null): boolean {
  if (error === null) return true;
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthApiError(error)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 429;
}
