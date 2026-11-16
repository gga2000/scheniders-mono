import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import { adminDisplayName } from "@/lib/support-admin-name";
import { env } from "@/lib/admin-env";
import {
  StartSupportViewSchema,
  SUPPORT_VIEW_REFUSALS,
  supportViewUrl,
  supportViewerEmail,
} from "@/lib/support-view";

export const dynamic = "force-dynamic";

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * The caller's viewer sign-in: found, or made now (auth user flagged
 * support_viewer, its profile, its row). Made only by this route, so the flag
 * is set only here.
 */
async function ensureViewer(supabase: AdminDb, adminId: string, adminName: string): Promise<string> {
  const existing = await supabase.from("support_viewer_users").select("user_id").eq("admin_id", adminId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return (existing.data as { user_id: string }).user_id;

  const email = supportViewerEmail(adminId);
  let userId: string;
  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { support_viewer: true },
    user_metadata: { full_name: `Fermi support · ${adminName}` },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else if (created.error?.code === "email_exists") {
    // An earlier try made the sign-in and stopped before its row.
    const found = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    if (!found.data.user) throw new Error(`Viewer lookup failed: ${found.error?.message ?? "no user"}`);
    userId = found.data.user.id;
    const flagged = await supabase.auth.admin.updateUserById(userId, { app_metadata: { support_viewer: true } });
    if (flagged.error) throw flagged.error;
  } else {
    throw new Error(`Viewer create failed: ${created.error?.message ?? "no user"}`);
  }

  const profile = await supabase.from("user_profiles").upsert(
    { id: userId, email, display_name: `Fermi support · ${adminName}`, role: "viewer", is_active: true },
    { onConflict: "id" },
  );
  if (profile.error) throw profile.error;
  const row = await supabase.from("support_viewer_users").insert({ user_id: userId, admin_id: adminId });
  if (row.error) throw row.error;
  return userId;
}

/**
 * POST /api/support/view {tenantId} — open the merchant's own app, look only,
 * for 30 minutes. Answers a one-time sign-in link for a new window. The
 * merchant sees the visit in Settings > Support activity.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = StartSupportViewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const platformUrl = env.PLATFORM_URL;
  if (!platformUrl) {
    return NextResponse.json({ error: "PLATFORM_URL is not set for the staff console" }, { status: 500 });
  }

  try {
    const supabase = createAdminClient();
    const viewerId = await ensureViewer(supabase, admin.user.id, await adminDisplayName(supabase, admin));

    const { data, error } = await supabase.rpc("support_view_start", {
      p_admin_id: admin.user.id,
      p_viewer_user_id: viewerId,
      p_tenant_id: parsed.data.tenantId,
    });
    const refusal = error?.code === "P0001" && error.message ? SUPPORT_VIEW_REFUSALS[error.message] : undefined;
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    const link = await supabase.auth.admin.generateLink({ type: "magiclink", email: supportViewerEmail(admin.user.id) });
    const hashedToken = link.data.properties?.hashed_token;
    if (!hashedToken || link.data.user?.id !== viewerId) {
      throw new Error(`Viewer sign-in link failed: ${link.error?.message ?? "wrong user"}`);
    }

    const session = data as { session_id: string; expires_at: string };
    await logAdminActivity({
      adminUserId: admin.user.id,
      actorEmail: admin.user.email,
      tenantId: parsed.data.tenantId,
      action: "support_view",
      details: { session_id: session.session_id },
    });
    return NextResponse.json({ url: supportViewUrl(platformUrl, hashedToken), expiresAt: session.expires_at });
  } catch (error) {
    console.error("Support view start error:", error);
    return NextResponse.json({ error: "Failed to open the merchant view" }, { status: 500 });
  }
}

/** DELETE /api/support/view — end my look now. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient().rpc("support_view_end", { p_admin_id: admin.user.id });
  if (error) {
    console.error("Support view end error:", error);
    return NextResponse.json({ error: "Failed to end the merchant view" }, { status: 500 });
  }
  await logAdminActivity({
    adminUserId: admin.user.id,
    actorEmail: admin.user.email,
    action: "support_view_end",
    details: { ended: data },
  });
  return NextResponse.json({ success: true });
}
