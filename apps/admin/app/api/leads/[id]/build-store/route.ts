import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function POST(
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

    // Fetch the lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*, industry:industries(*)")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.prospect_tenant_id) {
      return NextResponse.json({ error: "Store already built for this lead" }, { status: 400 });
    }

    // Generate slug from merchant name
    const baseSlug = (lead.merchant_name || "store")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Create the tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        business_name: lead.merchant_name,
        slug,
        plan: "starter",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_prospect: true,
        prospect_lead_id: id,
        contact_phone: lead.page_phone || (lead.phone_numbers?.[0] as { number?: string })?.number || null,
        address: lead.address,
        city: lead.city,
        branding: body.branding || { logo_url: null, primary_color: "#3b82f6", secondary_color: "#8b5cf6" },
        settings: { timezone: "Asia/Baghdad", language: "ar", currency: "IQD" },
        metadata: {
          template: body.template || "general",
          created_from_lead: true,
        },
      })
      .select()
      .single();

    if (tenantError) throw tenantError;

    // Create products if provided
    if (body.products && Array.isArray(body.products) && body.products.length > 0) {
      const products = body.products.map((p: { name: string; price?: number; description?: string; image_url?: string }) => ({
        tenant_id: tenant.id,
        name: p.name,
        price: p.price || 0,
        description: p.description || null,
        image_url: p.image_url || null,
        status: "active",
      }));

      await supabase.from("products").insert(products);
    }

    // Create wallet for the tenant
    await supabase.from("wallet").insert({
      tenant_id: tenant.id,
      balance_iqd: 0,
      threshold_iqd: 5000,
    });

    // Update the lead
    await supabase
      .from("leads")
      .update({
        prospect_tenant_id: tenant.id,
        store_built_at: new Date().toISOString(),
        status: "store_built",
      })
      .eq("id", id);

    // Log activity
    await supabase.from("lead_activities").insert({
      lead_id: id,
      activity_type: "store_created",
      title: `Prospect store created: ${tenant.slug}`,
      metadata: { tenant_id: tenant.id, slug: tenant.slug, template: body.template || "general" },
      created_by: body.created_by || null,
    });

    return NextResponse.json({
      tenant,
      store_url: `/s/${tenant.slug}`,
    }, { status: 201 });
  } catch (error) {
    console.error("Build store error:", error);
    return NextResponse.json({ error: "Failed to build store" }, { status: 500 });
  }
}
