import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(_request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("lead_follow_ups")
      .select("*, assigned_user:user_profiles!lead_follow_ups_assigned_to_fkey(display_name, email, avatar_url)")
      .eq("lead_id", id)
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ follow_ups: data ?? [] });
  } catch (error) {
    console.error("Follow-ups GET error:", error);
    return NextResponse.json({ error: "Failed to fetch follow-ups" }, { status: 500 });
  }
}

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

    if (error) throw error;

    // Update next_follow_up_at on the lead
    const { data: earliestFollowUp } = await supabase
      .from("lead_follow_ups")
      .select("scheduled_at")
      .eq("lead_id", id)
      .eq("is_completed", false)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();

    if (earliestFollowUp) {
      await supabase
        .from("leads")
        .update({ next_follow_up_at: earliestFollowUp.scheduled_at })
        .eq("id", id);
    }

    return NextResponse.json({ follow_up: data }, { status: 201 });
  } catch (error) {
    console.error("Follow-ups POST error:", error);
    return NextResponse.json({ error: "Failed to create follow-up" }, { status: 500 });
  }
}
