import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOAuthClientToken } from "@scheniders/shared";
import { requireAdmin, resolveAdminRole } from "./admin-supabase";
import { env } from "./admin-env";
import { AdminAuthError, isCredentialRejection } from "./admin-auth-error";
import { hasPermission } from "./admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

export type AdminContext = { user: { id: string; email?: string | null }; role: AdminRole };

/**
 * Resolve the admin context from the caller's cookie-based Supabase session —
 * the transport the browser uses for same-origin fetches. `getUser()` validates
 * the JWT against the auth server (not just the stored cookie). Returns null
 * when there is no authenticated session; throws `AdminAuthError(403)` when the
 * user is authenticated but lacks admin-console access, and a plain error when
 * the auth server or database fails.
 */
async function adminFromCookies(): Promise<AdminContext | null> {
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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    if (isCredentialRejection(error)) return null;
    throw new Error(`Session validation failed: ${error?.message}`, { cause: error });
  }

  // A Claude connector token planted in the session cookie is no admin session.
  const { data } = await supabase.auth.getSession();
  if (data.session && isOAuthClientToken(data.session.access_token)) return null;

  const role = await resolveAdminRole(user.id);
  return { user: { id: user.id, email: user.email }, role };
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

function bearerToken(request: NextRequest): string | null {
  return request.headers.get("authorization")?.match(BEARER)?.[1] ?? null;
}

/**
 * The one place an `AdminAuthError` becomes a response. Anything else is a
 * genuine server failure: it is rethrown so the route's own error handling
 * (or Next.js) reports it as a 500 — never disguised as a 401/403.
 */
function authFailureResponse(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return NextResponse.json(
      { error: error.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: error.status },
    );
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
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (bearerToken(request)) return requireBearerAdmin(request);

  // No bearer token → fall back to the cookie session.
  try {
    const ctx = await adminFromCookies();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
  if (!hasPermission(guard.role, action)) {
    return NextResponse.json(
      { error: `Forbidden: missing permission "${action}"` },
      { status: 403 },
    );
  }
  return guard;
}
