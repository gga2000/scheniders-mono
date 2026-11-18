import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";
import { LEAD_GONE, leadGoneOn } from "@/lib/lead-update";
import { setNextFollowUp } from "@/lib/lead-next-follow-up";

// The follow-up form sends assigned_to "" or leaves it out: the follow-up is then
// its creator's. Any other owner must be active staff, the same rule as a lead's owner.
const followUpSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scheduled_at: z.iso.datetime({ offset: true }),
  description: z.string().trim().max(2000).optional(),
  assigned_to: z.union([z.uuid(), z.literal("")]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const parsed = followUpSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A follow-up needs a title and a time." }, { status: 400 });
    }
    const body = parsed.data;
    const supabase = createAdminClient();

    // assigned_to is a NOT NULL FK: an unassigned follow-up belongs to its creator.
    const owner = body.assigned_to || admin.user.id;
    if (owner !== admin.user.id) {
      const { data: staff, error: staffError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", owner)
        .eq("is_active", true)
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff) {
        return NextResponse.json({ error: "A follow-up can only go to an active staff member." }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("lead_follow_ups")
      .insert({
        lead_id: id,
        assigned_to: owner,
        scheduled_at: body.scheduled_at,
        title: body.title,
        description: body.description || null,
      })
      .select()
      .single();

    // A colleague deleted the lead: the same words as every other save on it.
    if (leadGoneOn(error, "lead_follow_ups_lead_id_fkey")) return NextResponse.json({ error: LEAD_GONE }, { status: 404 });
    if (error) throw error;

    await setNextFollowUp(supabase, id);

    return NextResponse.json({ follow_up: data }, { status: 201 });
  } catch (error) {
    console.error("Follow-ups POST error:", error);
    return NextResponse.json({ error: "Failed to create follow-up" }, { status: 500 });
  }
}
