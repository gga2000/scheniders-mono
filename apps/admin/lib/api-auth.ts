import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireAdmin, requireAdminRole } from "./admin-supabase";
import { env } from "./admin-env";
import { hasPermission } from "./admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

export type AdminContext = { user: { id: string; email?: string | null }; role: AdminRole };

/**
 * Resolve the admin context from the SSR session cookie. The admin middleware
 * already validates this cookie (and the admin role) on every `/api/*` request,
 * so this lets route handlers honor that same session instead of demanding a
 * separate `Authorization: Bearer` header.
 *
 * Returns `null` when there is no authenticated user. Throws when a user is
 * present but lacks an admin role (so the caller can answer 403, not 401).
 */
async function requireAdminFromCookies(): Promise<AdminContext | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Read-only in a route handler: cookie refresh is handled by middleware.
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = await requireAdminRole(user.id);
  return { user: { id: user.id, email: user.email }, role };
}

/**
 * Resolve the admin context for a request. Prefers an `Authorization: Bearer`
 * token (used by the `adminFetch` client helper); falls back to the SSR session
 * cookie when no token is present. On failure, returns a NextResponse the caller
 * should return directly.
 *
 * Usage:
 *   const guard = await requireAdminFromRequest(request);
 *   if (guard instanceof NextResponse) return guard;
 *   const { user, role } = guard;
 */
export async function requireAdminFromRequest(
  request: NextRequest,
): Promise<AdminContext | NextResponse> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    try {
      return (await requireAdmin(token)) as AdminContext;
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // No bearer token — fall back to the SSR cookie session.
  try {
    const ctx = await requireAdminFromCookies();
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
