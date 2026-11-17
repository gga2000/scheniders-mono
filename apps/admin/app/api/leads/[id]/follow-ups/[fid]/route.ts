import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

// What a follow-up change may carry. The console sends { is_completed: true };
// who completed it comes from the sign-in, never from the body.
const followUpChange = z
  .object({
    is_completed: z.boolean().optional(),
    scheduled_at: z.iso.datetime({ offset: true }).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined));

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id, fid } = await params;
    const missing = notAnId(id, fid);
    if (missing) return missing;
    const parsed = followUpChange.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Nothing to change on this follow-up." }, { status: 400 });
    }
    const body = parsed.data;
    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = {};

    if (body.is_completed !== undefined) {
      updateData.is_completed = body.is_completed;
      updateData.completed_at = body.is_completed ? new Date().toISOString() : null;
      updateData.completed_by = body.is_completed ? admin.user.id : null;
    }

    if (body.scheduled_at) updateData.scheduled_at = body.scheduled_at;
    if (body.title) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description || null;

    const { data, error } = await supabase
      .from("lead_follow_ups")
      .update(updateData)
      .eq("id", fid)
      .eq("lead_id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "This follow-up no longer exists." }, { status: 404 });

    // Recalculate next_follow_up_at
    const { data: earliest, error: earliestError } = await supabase
      .from("lead_follow_ups")
      .select("scheduled_at")
      .eq("lead_id", id)
      .eq("is_completed", false)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (earliestError) throw earliestError;

    const { error: leadError } = await supabase
      .from("leads")
      .update({ next_follow_up_at: earliest?.scheduled_at ?? null })
      .eq("id", id);
    if (leadError) throw leadError;

    return NextResponse.json({ follow_up: data });
  } catch (error) {
    console.error("Follow-up PATCH error:", error);
    return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
  }
}
