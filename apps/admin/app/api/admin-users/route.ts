import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the Add employee form sends. Empty strings read as "not given". */
const addStaffSchema = z.object({
  email: z
    .string({ error: "A valid email is required" })
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, { error: "A valid email is required" }),
  adminRole: z.enum(["super_admin", "support_staff"], { error: "adminRole must be 'super_admin' or 'support_staff'" }),
  displayName: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  password: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || v.length >= 8, { error: "Password must be at least 8 characters" }),
});

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
    // A failed page is not "no such login": that would try to create a second one.
    if (error) throw error;
    if (!data.users.length) break;
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
 * - Existing staff (matched by email) → a role change; a password is optional
 *   and resets theirs.
 * - Existing login that is not staff yet → a new password is required. The
 *   reset ends every sign-in on that login, so console access never goes to
 *   whoever already knew its old password. Logins that sign in to a store are
 *   refused.
 * - Brand-new email → creates an auth user (password required) plus a minimal
 *   user_profiles row with NO tenant membership (so zero main-app access), then
 *   adds the `admin_users` row.
 * Idempotent: re-adding an existing admin reactivates / updates their row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_admins");
  if (auth instanceof NextResponse) return auth;

  try {
    // No body or a broken one reads as an empty form, so the reason names the first missing field.
    const parsed = addStaffSchema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const { email, adminRole, displayName, password } = parsed.data;

    const supabase = createAdminClient();

    // 1. Resolve to an existing user, preferring the cheap profile lookup. A
    // failed lookup stops here: read as "no profile", it sent an existing
    // login down the path for new people.
    const { data: existingProfile, error: profileLookupErr } = await supabase
      .from("user_profiles")
      .select("id, display_name")
      // Exact match: emails are stored lower-case, and ilike treats "_" and "%"
      // as wildcards, so "john_doe@" would match a different person's "john1doe@".
      .eq("email", email)
      .maybeSingle();
    if (profileLookupErr) throw profileLookupErr;

    let userId: string | null = existingProfile?.id ?? null;
    if (!userId) userId = await findAuthUserIdByEmail(supabase, email);
    const existingAccount = userId !== null;

    // Your own role and password are not changed from here: another super
    // admin does it, so nobody demotes themselves by mistake.
    if (userId === auth.user.id) {
      return NextResponse.json(
        { error: "You cannot change your own access. Ask another super admin." },
        { status: 400 },
      );
    }

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
      const { error: profileErr } = await supabase
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
      if (profileErr) {
        return NextResponse.json(
          { error: `The login was created, but its profile could not be saved. Add the person again. (${profileErr.message})` },
          { status: 500 },
        );
      }
    } else {
      // An existing login can belong to someone other than the mailbox owner:
      // store admins create staff logins with a password they choose, and
      // those emails are not verified. Binding admin-console rights to such a
      // login would hand platform access to whoever knows its password, so a
      // login that belongs to any store is refused unless it is already
      // admin-console staff (a role change).
      const [{ data: alreadyStaff, error: staffErr }, { count: memberships, error: memberErr }] =
        await Promise.all([
          supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle(),
          supabase
            .from("tenant_members")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId),
        ]);
      if (staffErr || memberErr) {
        return NextResponse.json(
          { error: (staffErr ?? memberErr)?.message || "Could not check this account" },
          { status: 500 },
        );
      }
      if (!alreadyStaff && (memberships ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "This email already signs in to a store. Use a different email for the admin console.",
          },
          { status: 409 },
        );
      }
      // Nothing proves who knows this login's password: a store may have made
      // it, and its emails are not checked. A new password, set below before
      // access is granted, ends every sign-in on it (the auth server logs the
      // login out everywhere on an admin password change).
      if (!alreadyStaff && !password) {
        return NextResponse.json(
          {
            error:
              "This email already has a login. Set a new password for it: the old one stops working and every sign-in on it ends.",
          },
          { status: 400 },
        );
      }
    }
    if (userId && existingAccount && password) {
      // Existing login and a password: reset it before access is granted (for a
      // login that is not staff yet it was required above). A refused reset
      // stops here: access is not granted, and the log never says a password
      // was set when it was not.
      const { error: resetErr } = await supabase.auth.admin.updateUserById(userId, { password });
      if (resetErr) {
        return NextResponse.json(
          { error: `Could not set the new password: ${resetErr.message}` },
          { status: resetErr.status && resetErr.status < 500 ? 400 : 500 },
        );
      }
    }

    // An existing login with no profile row: the first try created the login
    // but could not save its profile, and the person was added again. Without
    // the row their Team page answers "Could not find" and their name falls
    // back to the email everywhere, so it is written before access is granted.
    if (existingAccount && !existingProfile) {
      const { error: profileErr } = await supabase
        .from("user_profiles")
        .upsert(
          { id: userId, email, display_name: displayName || email.split("@")[0], is_active: true },
          { onConflict: "id" },
        );
      if (profileErr) {
        return NextResponse.json(
          { error: `Could not save this person's profile, so access was not given. Try again. (${profileErr.message})` },
          { status: 500 },
        );
      }
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

    await logAdminAction(auth, "grant_admin_access", {
      details: {
        target_user_id: userId,
        target_email: email,
        admin_role: adminRole,
        created_account: !existingAccount,
        password_reset: existingAccount && Boolean(password),
      },
    });

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error("Add admin user error:", error);
    return NextResponse.json({ error: "Failed to add admin user" }, { status: 500 });
  }
}

/**
 * Revoke a person's admin-console access (super_admin only). Removes only the
 * `admin_users` row — their auth account and main-app access are untouched.
 * Guards against self-removal here; the database keeps one active super admin.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_admins");
  if (auth instanceof NextResponse) return auth;

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

  // A failed read is an error, not "not an admin user".
  const { data: target, error: readError } = await supabase
    .from("admin_users")
    .select("admin_role, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    console.error("Remove admin access: reading the admin row failed", readError);
    return NextResponse.json({ error: "Could not read this admin. Try again." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Not an admin user" }, { status: 404 });
  }

  // The last active super admin cannot go: the table refuses it
  // (admin_users_keep_a_super_admin), even when two removals run at once.
  const { error } = await supabase.from("admin_users").delete().eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminAction(auth, "remove_admin_access", {
    details: { target_user_id: userId, target_email: target.email ?? null, admin_role: target.admin_role },
  });

  return NextResponse.json({ success: true });
}
