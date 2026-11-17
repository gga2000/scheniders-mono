import { AuthInvalidJwtError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isCredentialRejection } from "./admin-auth-error";

/**
 * How long one staff sign-in lasts. Support runs 9 AM to midnight Baghdad
 * (15 hours), so a sign-in at the start of the day lasts the whole day and
 * never ends mid-shift; the next day asks for the password again. Round 13
 * found a staff session refreshed for 158 days on one sign-in, so a lost
 * laptop or browser profile was a staff key with no end.
 */
export const STAFF_SIGN_IN_MAX_MS = 16 * 60 * 60 * 1000;

/** What staff read when their sign-in has reached that age. */
export const SIGN_IN_ENDED = "Your sign-in ended after 16 hours. Sign in again.";

/** The claims the console reads from a staff access token. */
const staffClaims = z.object({
  sub: z.string().min(1),
  /** The auth server's session this token belongs to. */
  session_id: z.string().min(1),
  email: z.string().optional(),
  exp: z.number(),
  /** Each way this session proved who it is, with when (seconds). */
  amr: z.array(z.object({ timestamp: z.number() })).min(1),
});

export interface StaffToken {
  userId: string;
  sessionId: string;
  email: string | null;
  /** When this session last proved who it is (password, or a second step), in ms. */
  signedInAt: number;
}

/**
 * Checks a staff access token once: its signature against the project's
 * published keys (read once and kept, so usually no call to the auth server)
 * and its expiry. Without `token`, the session in the client's cookies.
 * Answers who it is and when the session signed in; null when there is no
 * token, or it is malformed, forged, expired or does not say when it signed
 * in. Throws when the check itself failed (the keys could not be read).
 * The check is local, so a session ended on the auth server still passes
 * until the token expires (an hour at most): the middleware asks the auth
 * server about the browser's session on every request, and holds the API's
 * token to that same session.
 */
export async function verifyStaffToken(
  auth: Pick<SupabaseClient["auth"], "getClaims">,
  token?: string,
  nowMs: number = Date.now(),
): Promise<StaffToken | null> {
  // Expiry is checked here: getClaims throws a plain error for an expired
  // token, which would read as a server failure instead of "sign in again".
  const { data, error } = await auth.getClaims(token, { allowExpired: true });
  if (!data) {
    if (error === null || error instanceof AuthInvalidJwtError || isCredentialRejection(error)) return null;
    throw new Error(`Access-token check failed: ${error.message}`, { cause: error });
  }
  const claims = staffClaims.safeParse(data.claims);
  if (!claims.success || claims.data.exp * 1000 <= nowMs) return null;
  return {
    userId: claims.data.sub,
    sessionId: claims.data.session_id,
    email: claims.data.email || null,
    signedInAt: Math.max(...claims.data.amr.map((step) => step.timestamp)) * 1000,
  };
}

/** Whether a staff sign-in made at `signedInAt` has reached its age limit by `nowMs`. */
export function signInEnded(signedInAt: number, nowMs: number = Date.now()): boolean {
  return nowMs - signedInAt > STAFF_SIGN_IN_MAX_MS;
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** The token in an `Authorization: Bearer <token>` header, as `adminFetch` sends it. */
export function bearerToken(headers: Headers): string | null {
  return headers.get("authorization")?.match(BEARER)?.[1] ?? null;
}
