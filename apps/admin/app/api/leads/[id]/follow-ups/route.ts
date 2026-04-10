import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("lead_follow_ups")
      .insert({
        lead_id: id,
        assigned_to: body.assigned_to,
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
