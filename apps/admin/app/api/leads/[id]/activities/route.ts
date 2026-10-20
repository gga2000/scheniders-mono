import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(_request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("lead_activities")
      .select("*, created_by_user:user_profiles!lead_activities_created_by_fkey(display_name, email, avatar_url)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ activities: data ?? [] });
  } catch (error) {
    console.error("Lead activities GET error:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: id,
        activity_type: body.activity_type,
        title: body.title,
        description: body.description || null,
        metadata: body.metadata || {},
        created_by: body.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Update last_contacted_at for communication activities
    if (["call", "whatsapp", "email", "meeting"].includes(body.activity_type)) {
      await supabase
        .from("leads")
        .update({ last_contacted_at: new Date().toISOString() })
        .eq("id", id);
    }

    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (error) {
    console.error("Lead activities POST error:", error);
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
