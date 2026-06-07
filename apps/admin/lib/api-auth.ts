import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireAdmin, resolveAdminRole } from "./admin-supabase";
import { env } from "./admin-env";
import { hasPermission } from "./admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

export type AdminContext = { user: { id: string; email?: string | null }; role: AdminRole };

/**
 * Resolve the admin context from the caller's cookie-based Supabase session —
 * the transport the browser uses for same-origin fetches. `getUser()` validates
 * the JWT against the auth server (not just the stored cookie). Returns null
 * when there is no authenticated session; throws when the user is authenticated
 * but lacks admin-console access.
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

  if (error || !user) return null;

  const role = await resolveAdminRole(user.id);
  return { user: { id: user.id, email: user.email }, role };
}

/**
 * Resolve the admin context for an API route. Accepts either an
 * `Authorization: Bearer <token>` header (server-to-server / `adminFetch`
 * callers) or the browser's cookie-based Supabase session — keeping the
 * route-level guard consistent with the cookie-based middleware and browser
 * client. On failure, returns a NextResponse the caller should return directly:
 *   401 — no authenticated identity at all
 *   403 — authenticated, but not an active admin
 *
 * Usage:
 *   const guard = await requireAdminFromRequest(request);
 *   if (guard instanceof NextResponse) return guard;
 *   const { user, role } = guard;
 */
export async function requireAdminFromRequest(
  request: NextRequest,
): Promise<AdminContext | NextResponse> {
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");

  // Explicit bearer token → validate strictly.
  if (bearer) {
    try {
      return (await requireAdmin(bearer)) as AdminContext;
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // No bearer token → fall back to the cookie session.
  try {
    const ctx = await adminFromCookies();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return ctx;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
