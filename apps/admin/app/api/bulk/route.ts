import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivityBatch } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { topUpWallet, topupAmountSchema } from "@/lib/wallet-topup";

const bulkTopupAmountSchema = topupAmountSchema.min(1000);

const BulkActionSchema = z.object({
  action: z.enum([
    "change_plan",
    "suspend",
    "reactivate",
    "send_notification",
    "extend_trial",
    "top_up",
  ]),
  tenant_ids: z.array(z.string()).min(1).max(100),
  params: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "bulk_action");
  if (auth instanceof NextResponse) return auth;

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
      // 5. Top Up Wallets
      // -----------------------------------------------------------------
      case "top_up": {
        // Crediting money needs the wallet permission on top of bulk_action.
        if (!hasPermission(auth.role, "top_up_wallet")) {
          return NextResponse.json(
            { error: 'Forbidden: missing permission "top_up_wallet"' },
            { status: 403 }
          );
        }

        const amountParsed = bulkTopupAmountSchema.safeParse(params?.amount_iqd);
        if (!amountParsed.success) {
          return NextResponse.json(
            { error: "params.amount_iqd is required and must be a whole number between 1,000 and 10,000,000" },
            { status: 400 }
          );
        }
        const amount = amountParsed.data;

        const description =
          typeof params?.description === "string" && params.description.trim()
            ? params.description.trim()
            : "Bulk top-up";

        const succeeded: { tenant_id: string; new_balance: number }[] = [];
        const failed: { tenant_id: string; error: string }[] = [];
        for (const tid of tenant_ids) {
          const result = await topUpWallet({
            tenantId: tid,
            amount,
            description,
            adminUserId: auth.user.id,
          });
          if (result.ok) succeeded.push({ tenant_id: tid, new_balance: result.newBalance });
          else failed.push({ tenant_id: tid, error: result.error });
        }

        // Audit only the wallets that were actually credited.
        await logAdminActivityBatch({
          adminUserId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          tenantIds: succeeded.map((s) => s.tenant_id),
          action: "bulk_top_up",
          details: { tenant_ids: succeeded.map((s) => s.tenant_id), params: { amount_iqd: amount, description } },
        });

        if (failed.length > 0) {
          console.error("[bulk top_up] failures:", failed);
          return NextResponse.json(
            {
              success: false,
              error: `Top-up failed for ${failed.length} of ${tenant_ids.length} merchant(s)${
                succeeded.length > 0 ? `; ${succeeded.length} were credited` : ""
              }`,
              succeeded,
              failed,
            },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, affected: succeeded.length, succeeded });
      }

      // -----------------------------------------------------------------
      // 6. Send Notification
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

        // Insert activity logs for each tenant. Attributed to the admin who
        // ran the action, not to "system" — they are the actor on record.
        await logAdminActivityBatch({
          adminUserId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          tenantIds: tenant_ids,
          action: "bulk_send_notification",
          details: { tenant_ids, params: { message } },
        });
        break;
      }
    }

    // -----------------------------------------------------------------
    // Log all bulk actions to admin_activity_logs
    // (skip send_notification — it already logs its own entries above)
    // -----------------------------------------------------------------
    if (action !== "send_notification") {
      await logAdminActivityBatch({
        adminUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        tenantIds: tenant_ids,
        action: `bulk_${action}`,
        details: { tenant_ids, params },
      });
    }

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
