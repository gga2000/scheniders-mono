import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_TIERS } from "@/types/admin";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivityBatch } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { topUpWallet, topupAmountSchema, topupRequestIdSchema } from "@/lib/wallet-topup";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { staffReasonSchema, staffRequestIdSchema } from "@/lib/staff-reason";
import { updateShop, type ShopChange, type ShopUpdateActor } from "@/lib/shop-update";
import { tooManyShops } from "@/lib/bulk-not-done";

const bulkTopupAmountSchema = topupAmountSchema.min(1000);

type Failure = { tenant_id: string; error: string };

/**
 * The shops not done, with their names, so staff can see which ones to look
 * at. Money or changes may already have gone through for the others, so a
 * failed name read still answers with the outcome: it is logged, and those
 * lines go without a name.
 */
async function withNames(
  supabase: ReturnType<typeof createAdminClient>,
  failed: Failure[],
): Promise<(Failure & { name: string | null })[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, business_name")
    .in("id", failed.map((f) => f.tenant_id));
  if (error) console.error("[bulk] could not read the names of the shops not done:", error.message);
  const names = new Map((data ?? []).map((t: { id: string; business_name: string }) => [t.id, t.business_name]));
  return failed.map((f) => ({ ...f, name: names.get(f.tenant_id) ?? null }));
}

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
  const notChanged: Failure[] = [];
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
        failed: await withNames(supabase, notChanged),
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
  tenant_ids: z.array(z.string().uuid()).min(1),
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
    // "Select all" can tick more shops than one action takes: say so, with the count.
    const tooMany = tooManyShops(tenant_ids.length);
    if (tooMany) return NextResponse.json({ error: tooMany }, { status: 400 });
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
        // A plan decides what each shop pays each month: the staff log keeps why.
        const reason = staffReasonSchema.safeParse(params?.reason);
        if (!reason.success) {
          return NextResponse.json(
            { error: `params.reason: ${reason.error.issues[0]?.message ?? "A reason is required"}` },
            { status: 400 }
          );
        }
        return await changeShops(supabase, tenant_ids, { plan: plan.data, reason: reason.data }, auth.user);
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

        // One id for the whole ask: a retry extends each shop once (#1196).
        const requestId = staffRequestIdSchema.safeParse(params?.request_id);
        if (!requestId.success) {
          return NextResponse.json(
            { error: requestId.error.issues[0]?.message ?? "params.request_id is required" },
            { status: 400 }
          );
        }

        // One RPC per shop: it moves the trial date and the bill date together,
        // refuses a shop that is not on trial, and writes that shop's audit row.
        const extended: { tenant_id: string; trial_ends_at: string }[] = [];
        const notExtended: Failure[] = [];
        let crashed = false;
        for (const tid of tenant_ids) {
          try {
            const result = await extendTrial(supabase, tid, days, reason.data, auth.user, requestId.data, "bulk");
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
              failed: await withNames(supabase, notExtended),
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

        // Why the money is added: on every wallet line and in the staff log.
        const reason = staffReasonSchema.safeParse(params?.description);
        if (!reason.success) {
          return NextResponse.json(
            { error: `params.description: ${reason.error.issues[0]?.message ?? "A reason is required"}` },
            { status: 400 }
          );
        }
        const description = reason.data;

        // `duplicate` marks a wallet this same request already credited: a
        // retry after a partial failure moves no money for it.
        const succeeded: { tenant_id: string; new_balance: number; duplicate: boolean }[] = [];
        const failed: Failure[] = [];
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
              failed: await withNames(supabase, failed),
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
