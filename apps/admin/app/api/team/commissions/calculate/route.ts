import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { period_start, period_end } = body;

    if (!period_start || !period_end) {
      return NextResponse.json({ error: "period_start and period_end required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get active commission config
    const { data: config } = await supabase
      .from("admin_commission_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!config) {
      return NextResponse.json({ error: "No active commission config" }, { status: 400 });
    }

    // Get all converted leads with their assigned employees
    const { data: convertedLeads } = await supabase
      .from("leads")
      .select("id, assigned_to, created_by, converted_tenant_id")
      .eq("status", "converted")
      .not("converted_tenant_id", "is", null);

    if (!convertedLeads || convertedLeads.length === 0) {
      return NextResponse.json({ message: "No converted leads found", calculated: 0 });
    }

    let calculated = 0;

    for (const lead of convertedLeads) {
      const employeeId = lead.assigned_to || lead.created_by;
      if (!employeeId || !lead.converted_tenant_id) continue;

      // Count orders for this tenant in the period
      const { count: orderCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", lead.converted_tenant_id)
        .gte("created_at", period_start)
        .lte("created_at", period_end);

      const orders = orderCount ?? 0;
      let earned = 0;

      // Calculate based on config type
      if (config.type === "per_order") {
        const rate = (config.config as { rate_per_order?: number }).rate_per_order ?? 250;
        earned = orders * rate;
      } else if (config.type === "tiered_bonus") {
        const tiers = (config.config as { tiers?: { min_orders: number; max_orders?: number; rate: number }[] }).tiers ?? [];
        for (const tier of tiers) {
          if (orders >= tier.min_orders && (!tier.max_orders || orders <= tier.max_orders)) {
            earned = orders * tier.rate;
            break;
          }
        }
      }

      // Upsert commission record
      const { data: existing } = await supabase
        .from("admin_employee_commissions")
        .select("id")
        .eq("admin_user_id", employeeId)
        .eq("tenant_id", lead.converted_tenant_id)
        .eq("period_start", period_start)
        .eq("period_end", period_end)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("admin_employee_commissions")
          .update({ orders_count: orders, amount_earned: earned })
          .eq("id", existing.id);
      } else {
        await supabase.from("admin_employee_commissions").insert({
          admin_user_id: employeeId,
          lead_id: lead.id,
          tenant_id: lead.converted_tenant_id,
          commission_config_id: config.id,
          period_start,
          period_end,
          orders_count: orders,
          amount_earned: earned,
          status: "pending",
        });
      }

      calculated++;
    }

    return NextResponse.json({ success: true, calculated });
  } catch (error) {
    console.error("Commission calculate error:", error);
    return NextResponse.json({ error: "Failed to calculate commissions" }, { status: 500 });
  }
}
