import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = request.nextUrl;

    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;

    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    const priority = searchParams.get("priority");
    const tier = searchParams.get("tier");
    const industryId = searchParams.get("industry_id");
    const assignedTo = searchParams.get("assigned_to");
    const hasStore = searchParams.get("has_store");
    const scoreMin = searchParams.get("score_min");
    const scoreMax = searchParams.get("score_max");
    const search = searchParams.get("search");
    const sortParam = searchParams.get("sort") ?? "created_at:desc";

    const supabase = createAdminClient();

    let query = supabase
      .from("leads")
      .select(
        "*, industry:industries(*), created_by_user:user_profiles!leads_created_by_fkey(id, display_name, email, avatar_url)",
        { count: "exact" }
      );

    if (status) query = query.eq("status", status);
    if (platform) query = query.eq("platform", platform);
    if (priority) query = query.eq("priority", priority);
    if (tier) query = query.eq("tier", tier);
    if (industryId) query = query.eq("industry_id", industryId);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (hasStore === "true") query = query.not("prospect_tenant_id", "is", null);
    if (hasStore === "false") query = query.is("prospect_tenant_id", null);
    if (scoreMin) query = query.gte("lead_score", Number(scoreMin));
    if (scoreMax) query = query.lte("lead_score", Number(scoreMax));

    if (search) {
      query = query.or(
        `merchant_name.ilike.%${search}%,management_name.ilike.%${search}%,handle.ilike.%${search}%,page_phone.ilike.%${search}%,city.ilike.%${search}%`
      );
    }

    // Sort
    const sortParts = sortParam.split(",").filter(Boolean);
    for (const part of sortParts) {
      const [col, dir] = part.split(":");
      if (col) {
        query = query.order(col, { ascending: dir === "asc" });
      }
    }

    query = query.range(offset, offset + limit - 1);

    const { data: leads, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      leads: leads ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("Leads GET error:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const supabase = createAdminClient();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        merchant_name: body.merchant_name,
        industry_id: body.industry_id || null,
        platform: body.platform || "instagram",
        platform_url: body.platform_url || null,
        handle: body.handle || null,
        follower_count: body.follower_count || 0,
        post_count: body.post_count || 0,
        management_name: body.management_name || null,
        management_info: body.management_info || null,
        page_phone: body.page_phone || null,
        phone_numbers: body.phone_numbers || [],
        contact_via_dm: body.contact_via_dm ?? false,
        website_url: body.website_url || null,
        email: body.email || null,
        avg_view_count: body.avg_view_count || 0,
        avg_like_count: body.avg_like_count || 0,
        avg_comments_count: body.avg_comments_count || 0,
        avg_order_count: body.avg_order_count || 0,
        address: body.address || null,
        city: body.city || null,
        governorate_code: body.governorate_code || null,
        is_online_only: body.is_online_only ?? false,
        branches: body.branches || [],
        priority: body.priority || "medium",
        assigned_to: body.assigned_to || null,
        assigned_at: body.assigned_to ? new Date().toISOString() : null,
        tags: body.tags || [],
        source_campaign: body.source_campaign || null,
        source_medium: body.source_medium || null,
        // Attribute the lead to the authenticated admin who added it (who, not client-supplied).
        created_by: admin.user.id,
      })
      .select(
        "*, industry:industries(*), created_by_user:user_profiles!leads_created_by_fkey(id, display_name, email, avatar_url)"
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("Leads POST error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
