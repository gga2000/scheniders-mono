import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { adminDisplayName } from "@/lib/support-admin-name";
import { logAdminAction } from "@/lib/activity-logger";
import { NoticePostSchema, NoticeSchema, SUPPORT_NOTICE_COLUMNS, supportRefusal } from "@/lib/support";

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notice: data });
}

/** Post a notice to every merchant; it replaces the one before it. */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = NoticePostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A notice needs a text of up to 300 letters and a length." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("support_notice_post", {
    p_admin_id: admin.user.id,
    p_admin_name: await adminDisplayName(supabase, admin),
    p_body: parsed.data.body,
    p_hours: parsed.data.hours,
  });
  const refusal = supportRefusal(error);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notice = NoticeSchema.parse(data);
  await logAdminAction(admin, "support_notice_posted", {
    details: { notice_id: notice.id, hours: parsed.data.hours, body: notice.body },
  });
  return NextResponse.json({ notice });
}

/** End the live notice now. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient().rpc("support_notice_end", { p_admin_id: admin.user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(admin, "support_notice_ended", { details: { ended: data } });
  return NextResponse.json({ ended: data });
}
