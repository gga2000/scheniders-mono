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
      .select("*")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === "converted") {
      return NextResponse.json({ error: "Lead already converted" }, { status: 400 });
    }

    let tenantId: string;

    if (lead.prospect_tenant_id) {
      // Convert existing prospect store to real merchant
      const { error: updateError } = await supabase
        .from("tenants")
        .update({
          is_prospect: false,
          status: "active",
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", lead.prospect_tenant_id);

      if (updateError) throw updateError;
      tenantId = lead.prospect_tenant_id;
    } else {
      // Create new tenant from lead data
      const slug = (lead.merchant_name || "store")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        + "-" + Date.now().toString(36);

      const { data: tenant, error: createError } = await supabase
        .from("tenants")
        .insert({
          business_name: lead.merchant_name,
          slug,
          plan: body.plan || "starter",
          status: "active",
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          is_prospect: false,
          prospect_lead_id: id,
          contact_phone: lead.page_phone,
          address: lead.address,
          city: lead.city,
          settings: { timezone: "Asia/Baghdad", language: "ar", currency: "IQD" },
          branding: { logo_url: null, primary_color: "#3b82f6", secondary_color: "#8b5cf6" },
        })
        .select()
        .single();

      if (createError || !tenant) throw createError;
      tenantId = tenant.id;

      // Create wallet
      await supabase.from("wallet").insert({
        tenant_id: tenantId,
        balance_iqd: 0,
        threshold_iqd: 5000,
      });
    }

    // Create subscription
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      plan: body.plan || "starter",
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });

    // Update lead
    await supabase
      .from("leads")
      .update({
        converted_tenant_id: tenantId,
        converted_at: now.toISOString(),
        status: "converted",
      })
      .eq("id", id);

    // Log activity
    await supabase.from("lead_activities").insert({
      lead_id: id,
      activity_type: "conversion",
      title: "Lead converted to merchant",
      metadata: { tenant_id: tenantId },
      created_by: body.created_by || null,
    });

    // Create commission record if lead has an assigned employee
    if (lead.assigned_to || lead.created_by) {
      const employeeId = lead.assigned_to || lead.created_by;
      const { data: activeConfig } = await supabase
        .from("admin_commission_config")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (activeConfig) {
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        await supabase.from("admin_employee_commissions").insert({
          admin_user_id: employeeId,
          lead_id: id,
          tenant_id: tenantId,
          commission_config_id: activeConfig.id,
          period_start: periodStart.toISOString().split("T")[0],
          period_end: periodEndDate.toISOString().split("T")[0],
          orders_count: 0,
          order_revenue: 0,
          amount_earned: 0,
          status: "pending",
        });
      }
    }

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
    });
  } catch (error) {
    console.error("Convert error:", error);
    return NextResponse.json({ error: "Failed to convert lead" }, { status: 500 });
  }
}
