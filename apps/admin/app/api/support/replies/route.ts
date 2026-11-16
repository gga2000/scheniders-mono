import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { SUPPORT_SAVED_REPLY_COLUMNS, SavedReplySchema } from "@/lib/support";

/** The team's saved replies, in the order they show above the reply box. */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient()
    .from("support_saved_replies")
    .select(SUPPORT_SAVED_REPLY_COLUMNS)
    .order("position", { ascending: true })
    .order("title", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ replies: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = SavedReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A saved reply needs a short title and a text." }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("support_saved_replies")
    .insert({
      title: parsed.data.title,
      body: parsed.data.body,
      position: parsed.data.position ?? 1000,
      created_by: admin.user.id,
      updated_by: admin.user.id,
    })
    .select(SUPPORT_SAVED_REPLY_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(admin, "support_saved_reply_added", { details: { title: parsed.data.title } });
  return NextResponse.json({ reply: data });
}
