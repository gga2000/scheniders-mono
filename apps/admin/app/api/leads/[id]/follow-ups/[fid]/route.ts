import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id, fid } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = {};

    if (body.is_completed !== undefined) {
      updateData.is_completed = body.is_completed;
      if (body.is_completed) {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = body.completed_by || null;
      }
    }

    if (body.scheduled_at) updateData.scheduled_at = body.scheduled_at;
    if (body.title) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;

    const { data, error } = await supabase
      .from("lead_follow_ups")
      .update(updateData)
      .eq("id", fid)
      .eq("lead_id", id)
      .select()
      .single();

    if (error) throw error;

    // Recalculate next_follow_up_at
    const { data: earliest } = await supabase
      .from("lead_follow_ups")
      .select("scheduled_at")
      .eq("lead_id", id)
      .eq("is_completed", false)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    await supabase
      .from("leads")
      .update({ next_follow_up_at: earliest?.scheduled_at ?? null })
      .eq("id", id);

    return NextResponse.json({ follow_up: data });
  } catch (error) {
    console.error("Follow-up PATCH error:", error);
    return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
  }
}
