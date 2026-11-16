import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { SUPPORT_SAVED_REPLY_COLUMNS, SavedReplySchema } from "@/lib/support";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "This saved reply no longer exists." }, { status: 404 });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const parsed = SavedReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A saved reply needs a short title and a text." }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("support_saved_replies")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      ...(parsed.data.position === undefined ? {} : { position: parsed.data.position }),
      updated_by: admin.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SUPPORT_SAVED_REPLY_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound();

  await logAdminAction(admin, "support_saved_reply_changed", { details: { id, title: parsed.data.title } });
  return NextResponse.json({ reply: data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const { data, error } = await createAdminClient()
    .from("support_saved_replies")
    .delete()
    .eq("id", id)
    .select("title")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound();

  await logAdminAction(admin, "support_saved_reply_removed", {
    details: { id, title: (data as { title: string }).title },
  });
  return NextResponse.json({ success: true });
}
