import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set(["super_admin", "support_staff"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Find an auth user's id by email. The admin API can't filter by email, so we
 * scan pages — only used as a fallback when no user_profiles row exists for the
 * email (the common case is matched cheaply via user_profiles first).
 */
async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // Admin-console roster lives in admin_users (decoupled from platform roles).
    const { data: adminRows, error } = await supabase
      .from("admin_users")
      .select("user_id, admin_role, display_name, email")
      .order("display_name", { ascending: true });

    if (error) throw error;

    const ids = (adminRows ?? []).map((a) => a.user_id);
    const { data: profiles } = ids.length > 0
      ? await supabase.from("user_profiles").select("id, email, display_name").in("id", ids)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    return NextResponse.json({
      users: (adminRows ?? []).map((a) => {
        const p = profileById.get(a.user_id);
        return {
          id: a.user_id,
          email: p?.email ?? a.email ?? "",
          display_name: p?.display_name ?? a.display_name ?? p?.email ?? a.email ?? "Unknown",
          role: a.admin_role,
        };
      }),
    });
  } catch (error) {
    console.error("Admin users API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin users" },
      { status: 500 }
    );
  }
}

/**
 * Grant admin-console access to a person (super_admin only).
 *
 * - Existing user (matched by email) → just adds an `admin_users` row; they sign
 *   in with their EXISTING password (this is the "copy a main-app employee"
 *   case). Their main-app role is left untouched.
 * - Brand-new email → creates an auth user (password required) plus a minimal
 *   user_profiles row with NO tenant membership (so zero main-app access), then
 *   adds the `admin_users` row.
 * Idempotent: re-adding an existing admin reactivates / updates their row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can manage admin access" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const adminRole = ADMIN_ROLES.has(body.adminRole) ? (body.adminRole as string) : null;
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const password = body.password ? String(body.password) : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!adminRole) {
      return NextResponse.json(
        { error: "adminRole must be 'super_admin' or 'support_staff'" },
        { status: 400 },
      );
    }
    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // 1. Resolve to an existing user, preferring the cheap profile lookup.
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id, display_name")
      .ilike("email", email)
      .maybeSingle();

    let userId: string | null = existingProfile?.id ?? null;
    if (!userId) userId = await findAuthUserIdByEmail(supabase, email);

    // 2. Brand-new person → create the auth user (needs a password).
    if (!userId) {
      if (!password) {
        return NextResponse.json(
          {
            error:
              "No existing account for this email — provide a password (min 8 chars) to create one.",
          },
          { status: 400 },
        );
      }
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName || email.split("@")[0] },
      });
      if (createErr || !created.user) {
        return NextResponse.json(
          { error: createErr?.message || "Failed to create user" },
          { status: 400 },
        );
      }
      userId = created.user.id;

      // Minimal profile so actor joins / display work. role keeps its 'employee'
      // default and there's NO tenant membership → no main-app access.
      await supabase
        .from("user_profiles")
        .upsert(
          {
            id: userId,
            email,
            display_name: displayName || email.split("@")[0],
            is_active: true,
          },
          { onConflict: "id" },
        );
    } else if (password) {
      // Existing user and a password was supplied → reset it as a convenience.
      await supabase.auth.admin.updateUserById(userId, { password });
    }

    // 3. Grant admin-console access (idempotent).
    const resolvedName =
      displayName || existingProfile?.display_name || email.split("@")[0];
    const { error: upsertErr } = await supabase.from("admin_users").upsert(
      {
        user_id: userId,
        admin_role: adminRole,
        is_active: true,
        display_name: resolvedName,
        email,
        created_by: auth.user.id,
      },
      { onConflict: "user_id" },
    );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error("Add admin user error:", error);
    return NextResponse.json({ error: "Failed to add admin user" }, { status: 500 });
  }
}

/**
 * Revoke a person's admin-console access (super_admin only). Removes only the
 * `admin_users` row — their auth account and main-app access are untouched.
 * Guards against self-removal and removing the last active super admin.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can manage admin access" },
      { status: 403 },
    );
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: target } = await supabase
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Not an admin user" }, { status: 404 });
  }

  if (target.admin_role === "super_admin") {
    const { count } = await supabase
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("admin_role", "super_admin")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last super admin" },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase.from("admin_users").delete().eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
