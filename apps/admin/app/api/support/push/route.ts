import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { StaffPushRemoveSchema, StaffPushSubscriptionSchema } from "@/lib/support";

/**
 * "Phone alerts" for support: stores this device's push subscription for the
 * signed-in staff member. The `send-staff-push` edge function delivers to it
 * when a merchant writes. The owner is always the session's admin, never the body.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = StaffPushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "This browser sent a push subscription we cannot use." }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  const { error } = await createAdminClient().from("admin_push_subscriptions").upsert(
    {
      admin_user_id: admin.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("Support phone alerts on error:", error);
    return NextResponse.json({ error: "Failed to turn on phone alerts for this device" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = StaffPushRemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing the device to turn off." }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("admin_push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("admin_user_id", admin.user.id);
  if (error) {
    console.error("Support phone alerts off error:", error);
    return NextResponse.json({ error: "Failed to turn off phone alerts for this device" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
