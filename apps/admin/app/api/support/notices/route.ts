import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { adminDisplayName } from "@/lib/support-admin-name";
import { logAdminAction, logAdminActionOnce } from "@/lib/activity-logger";
import {
  NoticePostSchema,
  NoticeSchema,
  SUPPORT_NOTICE_COLUMNS,
  SUPPORT_SEND_UNSURE,
  SupportRequestIdSchema,
  supportRefusal,
  wasRepeat,
} from "@/lib/support";

const NoticeRequestSchema = NoticePostSchema.extend(SupportRequestIdSchema.shape);

/** The notice merchants see now at the top of their Help chat, if any. */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient()
    .from("support_notices")
    .select(SUPPORT_NOTICE_COLUMNS)
    .is("ended_at", null)
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error("Support notice read error:", error);
    return NextResponse.json({ error: "Failed to load the merchant notice" }, { status: 500 });
  }
  return NextResponse.json({ notice: data });
}

/** Post a notice to every merchant; it replaces the one before it. */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const raw: unknown = await request.json().catch(() => null);
  const parsed = NoticePostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A notice needs a text of up to 300 letters and a length." }, { status: 400 });
  }
  const sent = NoticeRequestSchema.safeParse(raw);
  if (!sent.success) {
    return NextResponse.json({ error: sent.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("support_notice_post", {
    p_admin_id: admin.user.id,
    p_admin_name: await adminDisplayName(supabase, admin),
    p_body: parsed.data.body,
    p_hours: parsed.data.hours,
    p_request_id: sent.data.request_id,
  });
  const refusal = supportRefusal(error);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  if (error) {
    console.error("Support notice post error:", error);
    // The notice may have been posted before its answer was lost; its id makes a retry safe.
    return NextResponse.json({ error: SUPPORT_SEND_UNSURE }, { status: 502 });
  }

  const notice = NoticeSchema.safeParse(data);
  if (!notice.success) {
    console.error("Support notice post answer:", notice.error);
    return NextResponse.json({ error: SUPPORT_SEND_UNSURE }, { status: 502 });
  }
  // One row per post: a repeat writes it only if the first post's row is missing.
  await logAdminActionOnce(
    admin,
    "support_notice_posted",
    { requestId: sent.data.request_id, repeat: wasRepeat(data) },
    { details: { notice_id: notice.data.id, hours: parsed.data.hours, body: notice.data.body } },
  );
  return NextResponse.json({ notice: notice.data });
}

/** Ending's own lost answer: pressing again would end a notice posted since, so look first. */
const NOTICE_END_UNSURE = "No answer came back, so the notice may have ended. Check the notice bar before trying again.";

/** End the live notice now. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient().rpc("support_notice_end", { p_admin_id: admin.user.id });
  if (error) {
    console.error("Support notice end error:", error);
    // Ending may have gone through; the bar shows whether a notice still runs.
    return NextResponse.json({ error: NOTICE_END_UNSURE }, { status: 502 });
  }

  await logAdminAction(admin, "support_notice_ended", { details: { ended: data } });
  return NextResponse.json({ ended: data });
}
