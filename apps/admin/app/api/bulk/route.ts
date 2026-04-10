import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";

const BulkActionSchema = z.object({
  action: z.enum([
    "change_plan",
    "suspend",
    "reactivate",
    "send_notification",
    "extend_trial",
  ]),
  tenant_ids: z.array(z.string()).min(1).max(100),
  params: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BulkActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, tenant_ids, params } = parsed.data;
    const supabase = createAdminClient();

    switch (action) {
      // -----------------------------------------------------------------
      // 1. Change Plan
      // -----------------------------------------------------------------
      case "change_plan": {
        const plan = params?.plan;
        if (
          !plan ||
          !["starter", "growth", "professional", "enterprise"].includes(
            plan as string
          )
        ) {
          return NextResponse.json(
            {
              error:
                'params.plan is required and must be one of: starter, growth, professional, enterprise',
            },
            { status: 400 }
          );
        }

        const { error: tenantError } = await supabase
          .from("tenants")
          .update({ plan: plan as string })
          .in("id", tenant_ids);

        if (tenantError) throw tenantError;

        const { error: subError } = await supabase
          .from("subscriptions")
          .update({ plan: plan as string })
          .in("tenant_id", tenant_ids);

        if (subError) throw subError;
        break;
      }

      // -----------------------------------------------------------------
      // 2. Suspend
      // -----------------------------------------------------------------
      case "suspend": {
        const { error } = await supabase
          .from("tenants")
          .update({ status: "suspended" })
          .in("id", tenant_ids);

        if (error) throw error;
        break;
      }

      // -----------------------------------------------------------------
      // 3. Reactivate
      // -----------------------------------------------------------------
      case "reactivate": {
        const { error } = await supabase
          .from("tenants")
          .update({ status: "active" })
          .in("id", tenant_ids);

        if (error) throw error;
        break;
      }

      // -----------------------------------------------------------------
      // 4. Extend Trial
      // -----------------------------------------------------------------
      case "extend_trial": {
        const days = params?.days;
        if (
          typeof days !== "number" ||
          !Number.isInteger(days) ||
          days < 1 ||
          days > 90
        ) {
          return NextResponse.json(
            { error: "params.days is required and must be an integer between 1 and 90" },
            { status: 400 }
          );
        }

        // Each tenant may have a different trial_ends_at, so we loop
        for (const tid of tenant_ids) {
          const { data: tenant, error: fetchError } = await supabase
            .from("tenants")
            .select("trial_ends_at")
            .eq("id", tid)
            .single();

          if (fetchError || !tenant) {
            console.error(`Failed to fetch tenant ${tid}:`, fetchError);
            continue;
          }

          const currentEnd = tenant.trial_ends_at
            ? new Date(tenant.trial_ends_at).getTime()
            : Date.now();
          const base = Math.max(currentEnd, Date.now());
          const newDate = new Date(base + days * 24 * 60 * 60 * 1000);

          const { error: updateError } = await supabase
            .from("tenants")
            .update({ trial_ends_at: newDate.toISOString() })
            .eq("id", tid);

          if (updateError) {
            console.error(`Failed to extend trial for tenant ${tid}:`, updateError);
          }
        }
        break;
      }

      // -----------------------------------------------------------------
      // 5. Send Notification
      // -----------------------------------------------------------------
      case "send_notification": {
        const message = params?.message;
        if (typeof message !== "string" || message.trim().length === 0) {
          return NextResponse.json(
            { error: "params.message is required and must be a non-empty string" },
            { status: 400 }
          );
        }

        // No actual notification system yet — just log the action
        console.log(
          `[bulk_send_notification] Sending to ${tenant_ids.length} tenants: "${message}"`
        );

        // Insert activity logs for each tenant
        const { error: notifLogError } = await supabase
          .from("admin_activity_logs")
          .insert(
            tenant_ids.map((tid) => ({
              admin_id: "system",
              action: "bulk_send_notification",
              details: { tenant_ids, params: { message } },
              tenant_id: tid,
            }))
          );

        if (notifLogError) {
          console.error("Failed to log send_notification:", notifLogError);
        }
        break;
      }
    }

    // -----------------------------------------------------------------
    // Log all bulk actions to admin_activity_logs
    // -----------------------------------------------------------------
    await supabase.from("admin_activity_logs").insert(
      tenant_ids.map((tid) => ({
        admin_id: "system",
        action: `bulk_${action}`,
        details: { tenant_ids, params },
        tenant_id: tid,
      }))
    );

    return NextResponse.json({
      success: true,
      affected: tenant_ids.length,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { error: "Failed to execute bulk action" },
      { status: 500 }
    );
  }
}
