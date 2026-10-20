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
      .from("lead_competitors")
      .select("*, competitor_lead:leads!lead_competitors_competitor_lead_id_fkey(id, merchant_name, follower_count, tier, platform, estimated_daily_orders), competitor_tenant:tenants!lead_competitors_competitor_tenant_id_fkey(id, business_name, slug)")
      .eq("lead_id", id);

    if (error) throw error;

    return NextResponse.json({ competitors: data ?? [] });
  } catch (error) {
    console.error("Competitors GET error:", error);
    return NextResponse.json({ error: "Failed to fetch competitors" }, { status: 500 });
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
      .from("lead_competitors")
      .insert({
        lead_id: id,
        competitor_lead_id: body.competitor_lead_id || null,
        competitor_tenant_id: body.competitor_tenant_id || null,
        relationship_type: body.relationship_type || "direct",
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ competitor: data }, { status: 201 });
  } catch (error) {
    console.error("Competitors POST error:", error);
    return NextResponse.json({ error: "Failed to add competitor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const competitorId = searchParams.get("competitor_id");
    if (!competitorId) {
      return NextResponse.json({ error: "competitor_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("lead_competitors")
      .delete()
      .eq("id", competitorId)
      .eq("lead_id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Competitors DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
