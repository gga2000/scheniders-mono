import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_TIERS } from "@/types/admin";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivityBatch } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { topUpWallet, topupAmountSchema, topupRequestIdSchema } from "@/lib/wallet-topup";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { staffReasonSchema } from "@/lib/staff-reason";

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
  tenant_ids: z.array(z.string().uuid()).min(1).max(100),
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
          !(PLAN_TIERS as readonly unknown[]).includes(plan)
        ) {
          return NextResponse.json(
            {
              error:
                `params.plan is required and must be one of: ${PLAN_TIERS.join(", ")}`,
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
          days > MAX_TRIAL_EXTENSION_DAYS
        ) {
          return NextResponse.json(
            {
              error: `params.days is required and must be an integer between 1 and ${MAX_TRIAL_EXTENSION_DAYS}`,
            },
            { status: 400 }
          );
        }
        const reason = staffReasonSchema.safeParse(params?.reason);
        if (!reason.success) {
          return NextResponse.json(
            { error: `params.reason: ${reason.error.issues[0]?.message ?? "A reason is required"}` },
            { status: 400 }
          );
        }

        // One RPC per shop: it moves the trial date and the bill date together,
        // refuses a shop that is not on trial, and writes that shop's audit row.
        const extended: { tenant_id: string; trial_ends_at: string }[] = [];
        const notExtended: { tenant_id: string; error: string }[] = [];
        let crashed = false;
        for (const tid of tenant_ids) {
          try {
            const result = await extendTrial(supabase, tid, days, reason.data, auth.user, "bulk");
            if (result.ok) extended.push({ tenant_id: tid, trial_ends_at: result.trialEndsAt });
            else notExtended.push({ tenant_id: tid, error: result.error });
          } catch (error) {
            crashed = true;
            console.error(`[bulk extend_trial] failed for tenant ${tid}:`, error);
            notExtended.push({ tenant_id: tid, error: "Failed to extend trial" });
          }
        }

        if (notExtended.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Trial not extended for ${notExtended.length} of ${tenant_ids.length} merchant(s)${
                extended.length > 0 ? `; ${extended.length} were extended` : ""
              }`,
              succeeded: extended,
              failed: notExtended,
            },
            // A shop that is not on trial is a refusal, not a server fault.
            { status: crashed ? 500 : 409 }
          );
        }

        return NextResponse.json({ success: true, affected: extended.length, succeeded: extended });
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

        const requestIdParsed = topupRequestIdSchema.safeParse(params?.request_id);
        if (!requestIdParsed.success) {
          return NextResponse.json(
            { error: "params.request_id is required and must be a UUID" },
            { status: 400 }
          );
        }
        const requestId = requestIdParsed.data;

        const description =
          typeof params?.description === "string" && params.description.trim()
            ? params.description.trim()
            : "Bulk top-up";

        // `duplicate` marks a wallet this same request already credited: a
        // retry after a partial failure moves no money for it.
        const succeeded: { tenant_id: string; new_balance: number; duplicate: boolean }[] = [];
        const failed: { tenant_id: string; error: string }[] = [];
        for (const tid of tenant_ids) {
          const result = await topUpWallet({
            tenantId: tid,
            amount,
            description,
            adminUserId: auth.user.id,
            requestId,
          });
          if (result.ok) {
            succeeded.push({ tenant_id: tid, new_balance: result.newBalance, duplicate: result.duplicate });
          } else {
            failed.push({ tenant_id: tid, error: result.error });
          }
        }

        // Audit only the wallets this call actually credited.
        const credited = succeeded.filter((s) => !s.duplicate).map((s) => s.tenant_id);
        await logAdminActivityBatch({
          adminUserId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          tenantIds: credited,
          action: "bulk_top_up",
          details: { tenant_ids: credited, params: { amount_iqd: amount, description } },
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
