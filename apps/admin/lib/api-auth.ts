import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOAuthClientToken } from "@scheniders/shared";
import { requireAdmin, resolveAdminRole } from "./admin-supabase";
import { env } from "./admin-env";
import { AdminAuthError } from "./admin-auth-error";
import { hasPermission } from "./admin-permissions";
import {
  NO_ACCESS_HEADERS,
  NO_CONSOLE_ACCESS,
  SIGN_IN_ENDED,
  SIGNED_OUT,
  bearerToken,
  signInEnded,
  verifyStaffToken,
} from "./staff-sign-in";
import type { AdminAction, AdminRole } from "@/types/admin";

export type AdminContext = { user: { id: string; email?: string | null }; role: AdminRole };

/**
 * Resolve the admin context from the caller's cookie-based Supabase session —
 * the transport the browser uses for same-origin fetches, and the one a page
 * has when it reads on the server. Returns null when
 * there is no valid session; throws `AdminAuthError(401)` for a sign-in past
 * the staff age limit, `AdminAuthError(403)` when the user lacks
 * admin-console access, and a plain error when the key read or database fails.
 */
export async function adminFromCookies(): Promise<AdminContext | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Some runtimes forbid setting cookies mid-request; the read still
            // works, so a failed refresh-cookie write is non-fatal here.
          }
        },
      },
    },
  );

  // The middleware asked the auth server about this session on the same
  // request; here the token is checked once more, locally (lib/staff-sign-in.ts).
  const token = await verifyStaffToken(supabase.auth);
  if (!token) return null;
  if (signInEnded(token.signedInAt)) throw new AdminAuthError(401, SIGN_IN_ENDED);

  // A Claude connector token planted in the session cookie is no admin session.
  const { data } = await supabase.auth.getSession();
  if (data.session && isOAuthClientToken(data.session.access_token)) return null;

  const role = await resolveAdminRole(token.userId);
  return { user: { id: token.userId, email: token.email }, role };
}

/** A request with no usable sign-in, in staff's words (SIGNED_OUT unless told otherwise). */
function signedOut(words: string = SIGNED_OUT): NextResponse {
  return NextResponse.json({ error: words }, { status: 401 });
}

/**
 * The one place an `AdminAuthError` becomes a response. Anything else is a
 * genuine server failure: it is rethrown so the route's own error handling
 * (or Next.js) reports it as a 500 — never disguised as a 401/403.
 */
function authFailureResponse(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    // A 403 here is always "no console access" (resolveAdminRole); a role
    // missing one permission is answered by forbidden() below instead. A 401
    // says the sign-in ended when it reached its age limit, else signed out:
    // the guard's own reason ("Invalid access token") is not staff's words.
    return error.status === 401
      ? signedOut(error.message === SIGN_IN_ENDED ? SIGN_IN_ENDED : SIGNED_OUT)
      : NextResponse.json({ error: NO_CONSOLE_ACCESS }, { status: 403, headers: NO_ACCESS_HEADERS });
  }
  throw error;
}

/**
 * Bearer-only admin guard (`Authorization: Bearer <token>`, as sent by
 * `adminFetch`). Returns the admin context, or a 401/403 NextResponse the
 * caller returns directly. Server errors propagate.
 *
 * Usage:
 *   const admin = await requireBearerAdmin(request);
 *   if (admin instanceof NextResponse) return admin;
 */
export async function requireBearerAdmin(
  request: NextRequest,
): Promise<AdminContext | NextResponse> {
  const token = bearerToken(request.headers);
  if (!token) return signedOut();
  try {
    return await requireAdmin(token);
  } catch (error) {
    return authFailureResponse(error);
  }
}

/**
 * Resolve the admin context for an API route. Accepts either an
 * `Authorization: Bearer <token>` header (server-to-server / `adminFetch`
 * callers) or the browser's cookie-based Supabase session — keeping the
 * route-level guard consistent with the cookie-based middleware and browser
 * client. On failure, returns a NextResponse the caller should return directly:
 *   401 — no authenticated identity at all
 *   403 — authenticated, but not an active admin
 * Server errors (auth server / database down) propagate as a thrown error.
 *
 * Usage:
 *   const guard = await requireAdminFromRequest(request);
 *   if (guard instanceof NextResponse) return guard;
 *   const { user, role } = guard;
 */
export async function requireAdminFromRequest(
  request: NextRequest,
): Promise<AdminContext | NextResponse> {
  // Explicit bearer token → validate strictly.
  if (bearerToken(request.headers)) return requireBearerAdmin(request);

  // No bearer token → fall back to the cookie session.
  try {
    const ctx = await adminFromCookies();
    if (!ctx) return signedOut();
    return ctx;
  } catch (error) {
    return authFailureResponse(error);
  }
}

/**
 * Same as `requireAdminFromRequest`, but also checks the resolved role
 * has the supplied permission (see `admin-permissions.ts`).
 */
export async function requireAdminPermission(
  request: NextRequest,
  action: AdminAction,
): Promise<AdminContext | NextResponse> {
  const guard = await requireAdminFromRequest(request);
  if (guard instanceof NextResponse) return guard;
  if (!hasPermission(guard.role, action)) return forbidden(action);
  return guard;
}

/**
 * The 403 for a login whose role lacks `action`, in words staff can act on.
 * Every action belongs to the super admin role, so "ask a super admin" is
 * always true. The action key stays in its own field for support and logs.
 */
export function forbidden(action: AdminAction): NextResponse {
  return NextResponse.json(
    { error: "Your login cannot do this. Ask a super admin.", permission: action },
    { status: 403 },
  );
}
