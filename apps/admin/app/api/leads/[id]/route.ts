import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = _request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const supabase = createAdminClient();

    const [leadResult, activitiesResult, followUpsResult, socialLinksResult, competitorsResult] =
      await Promise.all([
        supabase
          .from("leads")
          .select("*, industry:industries(*)")
          .eq("id", id)
          .single(),
        supabase
          .from("lead_activities")
          .select("*, created_by_user:user_profiles!lead_activities_created_by_fkey(display_name, email, avatar_url)")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("lead_follow_ups")
          .select("*, assigned_user:user_profiles!lead_follow_ups_assigned_to_fkey(display_name, email, avatar_url)")
          .eq("lead_id", id)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("lead_social_links")
          .select("*")
          .eq("lead_id", id),
        supabase
          .from("lead_competitors")
          .select("*, competitor_lead:leads!lead_competitors_competitor_lead_id_fkey(id, merchant_name, follower_count, tier), competitor_tenant:tenants!lead_competitors_competitor_tenant_id_fkey(id, business_name, slug)")
          .eq("lead_id", id),
      ]);

    if (leadResult.error) {
      if (leadResult.error.code === "PGRST116") {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      throw leadResult.error;
    }

    // Fetch assigned user info if assigned_to exists
    let assigned_user = null;
    if (leadResult.data.assigned_to) {
      const { data: user } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, avatar_url")
        .eq("id", leadResult.data.assigned_to)
        .single();
      assigned_user = user;
    }

    // Fetch created_by user info
    let created_by_user = null;
    if (leadResult.data.created_by) {
      const { data: user } = await supabase
        .from("user_profiles")
        .select("id, display_name, email")
        .eq("id", leadResult.data.created_by)
        .single();
      created_by_user = user;
    }

    return NextResponse.json({
      lead: {
        ...leadResult.data,
        assigned_user,
        created_by_user,
      },
      activities: activitiesResult.data ?? [],
      follow_ups: followUpsResult.data ?? [],
      social_links: socialLinksResult.data ?? [],
      competitors: competitorsResult.data ?? [],
    });
  } catch (error) {
    console.error("Lead GET error:", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // If status is changing, log an activity
    if (body.status) {
      const { data: current } = await supabase
        .from("leads")
        .select("status")
        .eq("id", id)
        .single();

      if (current && current.status !== body.status) {
        await supabase.from("lead_activities").insert({
          lead_id: id,
          activity_type: "status_change",
          title: `Status changed from ${current.status} to ${body.status}`,
          metadata: { from: current.status, to: body.status },
          created_by: body._updated_by || null,
        });

        // Update last_contacted_at if moving to contacted
        if (body.status === "contacted") {
          body.last_contacted_at = new Date().toISOString();
        }
      }
    }

    // If assigned_to is changing, log activity and set assigned_at
    if (body.assigned_to !== undefined) {
      body.assigned_at = body.assigned_to ? new Date().toISOString() : null;
    }

    // Whitelist allowed fields
    const ALLOWED_FIELDS = ["merchant_name", "industry_id", "platform", "platform_url", "follower_count", "post_count", "management_name", "management_info", "page_phone", "phone_numbers", "contact_via_dm", "website_url", "email", "avg_view_count", "avg_like_count", "avg_comments_count", "avg_order_count", "address", "city", "governorate_code", "is_online_only", "branches", "status", "priority", "assigned_to", "tags", "source_campaign", "source_medium", "source_referrer", "next_follow_up_at", "custom_fields", "last_contacted_at", "assigned_at"] as const;
    const updateData: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updateData[key] = body[key];
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .select("*, industry:industries(*)")
      .single();

    if (error) throw error;

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("Lead PATCH error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = _request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
