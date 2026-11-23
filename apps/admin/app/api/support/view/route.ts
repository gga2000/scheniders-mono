import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
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

/** The staff member's viewer sign-in, and the address its sign-in link is made for. */
interface Viewer {
  userId: string;
  email: string;
}

/** Makes a viewer sign-in at this address, flagged support_viewer; "taken" when an account already holds it. */
async function createViewer(supabase: AdminDb, email: string, adminName: string): Promise<Viewer | "taken"> {
  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { support_viewer: true },
    user_metadata: { full_name: `Fermi support · ${adminName}` },
  });
  if (created.data.user) return { userId: created.data.user.id, email };
  if (created.error?.code === "email_exists") return "taken";
  throw new Error(`Viewer create failed: ${created.error?.message ?? "no user"}`);
}

/**
 * The caller's viewer sign-in: found, or made now (auth user flagged
 * support_viewer, its profile, its row). Only this route sets the flag, and
 * app_metadata can be written only with the service role, so an account at
 * the viewer address without the flag was made some other way. It is never
 * taken over, because whoever made it could still sign in to it. The viewer
 * is then made at a second address no one can guess, so an account someone
 * signed up with a staff id does not switch View as merchant off for that
 * person (audit R4-N1: it answered 409 until a developer deleted it).
 */
/** The staff member's viewer row, if there is one: the sign-in it names. */
async function viewerRow(supabase: AdminDb, adminId: string): Promise<string | null> {
  const existing = await supabase.from("support_viewer_users").select("user_id").eq("admin_id", adminId).maybeSingle();
  if (existing.error) throw existing.error;
  return existing.data ? (existing.data as { user_id: string }).user_id : null;
}

/** The address of a viewer sign-in a row names, read from its account. */
async function viewerOf(supabase: AdminDb, userId: string): Promise<Viewer> {
  const found = await supabase.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (!email) throw new Error(`Viewer lookup failed: ${found.error?.message ?? "no address"}`);
  return { userId, email };
}

async function ensureViewer(supabase: AdminDb, adminId: string, adminName: string): Promise<Viewer> {
  const existing = await viewerRow(supabase, adminId);
  if (existing) return viewerOf(supabase, existing);

  const usual = supportViewerEmail(adminId);
  let viewer = await createViewer(supabase, usual, adminName);
  // Whether this press made the sign-in, so a press that loses the race below removes only its own.
  let made = viewer !== "taken";
  if (viewer === "taken") {
    const found = await supabase.auth.admin.generateLink({ type: "magiclink", email: usual });
    if (!found.data.user) throw new Error(`Viewer lookup failed: ${found.error?.message ?? "no user"}`);
    if (found.data.user.app_metadata?.support_viewer === true) {
      // An earlier try made the sign-in and stopped before its row: it carries the flag.
      viewer = { userId: found.data.user.id, email: usual };
    } else {
      console.error("Support view: the usual viewer address is held by an account the console did not make", { adminId });
      viewer = await createViewer(supabase, supportViewerEmail(adminId, randomUUID()), adminName);
      if (viewer === "taken") throw new Error("Viewer create failed: the second address is taken too");
      made = true;
    }
  }

  const profile = await supabase.from("user_profiles").upsert(
    { id: viewer.userId, email: viewer.email, display_name: `Fermi support · ${adminName}`, role: "viewer", is_active: true },
    { onConflict: "id" },
  );
  if (profile.error) throw profile.error;
  const row = await supabase.from("support_viewer_users").insert({ user_id: viewer.userId, admin_id: adminId });
  if (row.error?.code === "23505") {
    // Two presses at once (two tabs): the other press wrote the row first.
    // This one uses that viewer. A sign-in this press made at its own second
    // address is named by no row and no route would ever use it, so it is
    // removed (its profile goes with it); the look goes ahead either way
    // (round 25 structure new 6).
    const winner = await viewerRow(supabase, adminId);
    if (!winner) throw row.error;
    if (winner === viewer.userId) return viewer;
    if (made) {
      const removed = await supabase.auth.admin.deleteUser(viewer.userId);
      if (removed.error) console.error("Support view: an unused viewer sign-in could not be removed", { adminId, userId: viewer.userId });
    }
    return viewerOf(supabase, winner);
  }
  if (row.error) throw row.error;
  return viewer;
}

/**
 * POST /api/support/view {tenantId} — open the merchant's own app, look only,
 * for 30 minutes. Answers a one-time sign-in link for a new window. The
 * merchant sees the visit in Settings > Support activity: support_view_start
 * writes its support_view staff log row in the same step as the look.
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
    const viewer = await ensureViewer(supabase, admin.user.id, await adminDisplayName(supabase, admin));

    // The link first: a link that fails starts no look, so the merchant never
    // sees a visit that was not opened. A link made for a look the database
    // then refuses is never answered, and the viewer sees no shop without a
    // session (support_view_tenant).
    const link = await supabase.auth.admin.generateLink({ type: "magiclink", email: viewer.email });
    const hashedToken = link.data.properties?.hashed_token;
    if (!hashedToken || link.data.user?.id !== viewer.userId) {
      throw new Error(`Viewer sign-in link failed: ${link.error?.message ?? "wrong user"}`);
    }

    const { data, error } = await supabase.rpc("support_view_start", {
      p_admin_id: admin.user.id,
      p_viewer_user_id: viewer.userId,
      p_tenant_id: parsed.data.tenantId,
      p_actor_email: admin.user.email ?? null,
    });
    const refusal = error?.code === "P0001" && error.message ? SUPPORT_VIEW_REFUSALS[error.message] : undefined;
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    const session = data as { session_id: string; expires_at: string };
    return NextResponse.json({ url: supportViewUrl(platformUrl, hashedToken), expiresAt: session.expires_at });
  } catch (error) {
    console.error("Support view start error:", error);
    return NextResponse.json({ error: "Failed to open the merchant view" }, { status: 500 });
  }
}

/** DELETE /api/support/view — end my look now; the function writes the support_view_end row when it closed one. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { error } = await createAdminClient().rpc("support_view_end", {
    p_admin_id: admin.user.id,
    p_actor_email: admin.user.email ?? null,
  });
  if (error) {
    console.error("Support view end error:", error);
    return NextResponse.json({ error: "Failed to end the merchant view" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
