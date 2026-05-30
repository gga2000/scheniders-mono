import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "./admin-supabase";
import { hasPermission } from "./admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

export type AdminContext = { user: { id: string; email?: string | null }; role: AdminRole };

/**
 * Extract a bearer token from the request, validate it via `requireAdmin`,
 * and return the resolved admin context. On failure, returns a NextResponse
 * the caller should return directly.
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
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return (await requireAdmin(token)) as AdminContext;
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
