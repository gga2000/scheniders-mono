import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";
import { LEAD_GONE } from "@/lib/lead-update";
import { setNextFollowUp } from "@/lib/lead-next-follow-up";

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
    if (!data) {
      // Deleting a lead deletes its follow-ups: say which one is gone.
      const { data: lead, error: leadReadError } = await supabase.from("leads").select("id").eq("id", id).maybeSingle();
      if (leadReadError) throw leadReadError;
      return NextResponse.json({ error: lead ? "This follow-up no longer exists." : LEAD_GONE }, { status: 404 });
    }

    await setNextFollowUp(supabase, id);

    return NextResponse.json({ follow_up: data });
  } catch (error) {
    console.error("Follow-up PATCH error:", error);
    return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
  }
}
