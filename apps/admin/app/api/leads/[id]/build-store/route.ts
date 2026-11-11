import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";

// The dialog also sends business_name and slug; the store takes the lead's
// name and a generated slug, so those are not read.
const bodySchema = z.object({
  template: z.string().trim().min(1).max(40).default("general"),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        price: z.number().int().min(0).default(0),
        description: z.string().max(2000).nullish(),
        image_url: z.url().nullish(),
      }),
    )
    .max(10)
    .default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Building a demo store is lead work, which the sales team owns.
    const admin = await requireAdminPermission(request, "convert_lead");
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid store details" }, { status: 400 });
    }
    const body = parsed.data;
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

    // A converted lead already has its merchant tenant (convert_lead_atomic);
    // a prospect store on top of it would be a second tenant for one lead.
    if (lead.converted_tenant_id || lead.status === "converted") {
      return NextResponse.json({ error: "Lead already converted" }, { status: 409 });
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
        branding: { logo_url: null, primary_color: body.primary_color ?? "#3b82f6", secondary_color: "#8b5cf6" },
        settings: { timezone: "Asia/Baghdad", language: "ar", currency: "IQD" },
        metadata: {
          template: body.template,
          created_from_lead: true,
        },
      })
      .select()
      .single();

    if (tenantError) {
      // tenants_prospect_lead_id_key (one tenant per lead): a concurrent
      // convert or build-store created this lead's tenant after the checks
      // above. Nothing was written.
      if (tenantError.code === "23505" && tenantError.message.includes("tenants_prospect_lead_id_key")) {
        return NextResponse.json({ error: "A store already exists for this lead" }, { status: 409 });
      }
      throw tenantError;
    }

    // Create products if provided
    if (body.products.length > 0) {
      const products = body.products.map((p) => ({
        tenant_id: tenant.id,
        name: p.name,
        price: p.price,
        description: p.description ?? null,
        image_url: p.image_url ?? null,
        status: "active",
      }));

      const { error: productsError } = await supabase.from("products").insert(products);
      if (productsError) throw productsError;
    }

    // Create wallet for the tenant
    const { error: walletError } = await supabase.from("wallet").insert({
      tenant_id: tenant.id,
      balance_iqd: 0,
      threshold_iqd: 5000,
    });
    if (walletError) throw walletError;

    // Update the lead
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({
        prospect_tenant_id: tenant.id,
        store_built_at: new Date().toISOString(),
        status: "store_built",
      })
      .eq("id", id)
      .is("converted_tenant_id", null);
    if (leadUpdateError) throw leadUpdateError;

    // Log activity
    const { error: activityError } = await supabase.from("lead_activities").insert({
      lead_id: id,
      activity_type: "store_created",
      title: `Prospect store created: ${tenant.slug}`,
      metadata: { tenant_id: tenant.id, slug: tenant.slug, template: body.template },
      created_by: admin.user.id,
    });
    if (activityError) throw activityError;

    return NextResponse.json({
      tenant,
      store_url: `/s/${tenant.slug}`,
    }, { status: 201 });
  } catch (error) {
    console.error("Build store error:", error);
    return NextResponse.json({ error: "Failed to build store" }, { status: 500 });
  }
}
