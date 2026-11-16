import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_TIERS } from "@/types/admin";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivityBatch } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { topUpWallet, topupAmountSchema, topupRequestIdSchema } from "@/lib/wallet-topup";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { staffReasonSchema } from "@/lib/staff-reason";
import { updateShop, type ShopChange, type ShopUpdateActor } from "@/lib/shop-update";

const bulkTopupAmountSchema = topupAmountSchema.min(1000);

/**
 * One change for every picked shop, one database call per shop: the call
 * checks the change, writes the shop and its subscription, and writes that
 * shop's staff log row, all together. A shop the database refuses (paused, on
 * trial, the demo store) is reported with the reason, never counted as done.
 */
async function changeShops(
  supabase: ReturnType<typeof createAdminClient>,
  tenantIds: string[],
  change: ShopChange,
  actor: ShopUpdateActor,
) {
  const changed: { tenant_id: string; status: string; plan: string }[] = [];
  const notChanged: { tenant_id: string; error: string }[] = [];
  let crashed = false;
  for (const tid of tenantIds) {
    try {
      const result = await updateShop(supabase, tid, change, actor, "bulk");
      if (result.ok) changed.push({ tenant_id: tid, status: result.shop.status, plan: result.shop.plan });
      else notChanged.push({ tenant_id: tid, error: result.error });
    } catch (error) {
      crashed = true;
      console.error(`[bulk] change failed for tenant ${tid}:`, error);
      notChanged.push({ tenant_id: tid, error: "Failed to change this shop" });
    }
  }

  if (notChanged.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Not changed for ${notChanged.length} of ${tenantIds.length} merchant(s)${
          changed.length > 0 ? `; ${changed.length} were changed` : ""
        }`,
        succeeded: changed,
        failed: notChanged,
      },
      // A refusal is the shop's state, not a server fault.
      { status: crashed ? 500 : 409 }
    );
  }

  return NextResponse.json({ success: true, affected: changed.length, succeeded: changed });
}

const BulkActionSchema = z.object({
  action: z.enum([
    "change_plan",
    "suspend",
    "reactivate",
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
        const plan = z.enum(PLAN_TIERS).safeParse(params?.plan);
        if (!plan.success) {
          return NextResponse.json(
            {
              error:
                `params.plan is required and must be one of: ${PLAN_TIERS.join(", ")}`,
            },
            { status: 400 }
          );
        }
        return await changeShops(supabase, tenant_ids, { plan: plan.data }, auth.user);
      }

      // -----------------------------------------------------------------
      // 2. Suspend
      // -----------------------------------------------------------------
      case "suspend":
        return await changeShops(supabase, tenant_ids, { status: "suspended" }, auth.user);

      // -----------------------------------------------------------------
      // 3. Reactivate. A shop whose trial was never converted comes back on
      // trial; a shop on trial or a paused shop is refused and reported.
      // -----------------------------------------------------------------
      case "reactivate":
        return await changeShops(supabase, tenant_ids, { status: "active" }, auth.user);

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
          return forbidden("top_up_wallet");
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
    }
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { error: "Failed to execute bulk action" },
      { status: 500 }
    );
  }
}
