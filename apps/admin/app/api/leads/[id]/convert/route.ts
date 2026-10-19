import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

/** A converted merchant always starts on this plan; changing it afterwards is
 *  `change_plan` (super_admin), so the caller does not get to pick it here. */
const CONVERSION_PLAN = "starter";

const bodySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Open to support_staff by design — see `convert_lead` in admin-permissions.ts.
  const auth = await requireAdminPermission(request, "convert_lead");
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }
    const notes = parsed.data.notes || null;
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
          plan: CONVERSION_PLAN,
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
      const { error: walletError } = await supabase.from("wallet").insert({
        tenant_id: tenantId,
        balance_iqd: 0,
        threshold_iqd: 5000,
      });
      if (walletError) throw walletError;
    }

    // Create subscription
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error: subscriptionError } = await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      plan: CONVERSION_PLAN,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });
    if (subscriptionError) throw subscriptionError;

    // Update lead
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({
        converted_tenant_id: tenantId,
        converted_at: now.toISOString(),
        status: "converted",
      })
      .eq("id", id);
    if (leadUpdateError) throw leadUpdateError;

    // Log activity — attributed to the authenticated caller, never to a
    // client-supplied id.
    const { error: activityError } = await supabase.from("lead_activities").insert({
      lead_id: id,
      activity_type: "conversion",
      title: "Lead converted to merchant",
      description: notes,
      metadata: { tenant_id: tenantId, plan: CONVERSION_PLAN },
      created_by: auth.user.id,
    });
    if (activityError) throw activityError;

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
