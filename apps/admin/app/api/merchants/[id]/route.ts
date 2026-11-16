import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { readBillingLock } from "@/lib/billing-lock-tools";
import { updateShop } from "@/lib/shop-update";
import { z } from "zod";
import { PLAN_TIERS } from "@/types/admin";

const patchSchema = z
  .object({
    status: z.enum(["active", "trial", "limited", "suspended", "cancelled"]).optional(),
    plan: z.enum(PLAN_TIERS).optional(),
    auto_renew: z.boolean().optional(),
  })
  .refine((d) => d.status || d.plan || typeof d.auto_renew === "boolean", {
    message: "At least one field required",
  });

/**
 * A member row with the member's own profile. `tenant_members` has two keys to
 * `user_profiles` (the member and whoever invited them), so the embed names one.
 */
const TEAM_COLUMNS =
  "id, user_id, role, status, invited_at, joined_at, user_profiles!tenant_members_user_id_fkey(email, display_name, avatar_url)";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const supabase = createAdminClient();

    const [
      tenantResult,
      walletResult,
      subscriptionResult,
      transactionsResult,
      usageResult,
      teamResult,
      notesResult,
      orderCountResult,
      planLimitsResult,
      billingLock,
    ] = await Promise.all([
      // The health score and its parts, as the list shows them.
      supabase.from("tenants").select("*, staff_health_score, staff_health_parts").eq("id", id).single(),
      // A shop built from a lead may have no wallet or subscription yet: no row is not an error.
      supabase.from("wallet").select("*").eq("tenant_id", id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("tenant_id", id).maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("usage_tracking")
        .select("*")
        .eq("tenant_id", id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(6),
      // tenant_members points at user_profiles twice (user_id and invited_by), so the
      // member's own profile is named by its key. Only what the Team tab shows is read.
      supabase
        .from("tenant_members")
        .select(TEAM_COLUMNS)
        .eq("tenant_id", id),
      supabase
        .from("admin_notes")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false }),
      // Real orders, by the console's one rule: no deleted, draft or test rows.
      supabase
        .from("admin_order_facts")
        .select("tenant_id", { count: "exact", head: true })
        .eq("tenant_id", id),
      supabase.from("plan_limits").select("*"),
      // The lock the shop sees (Fermi A1), for the staff tools card.
      readBillingLock(supabase, id),
    ]);

    if (tenantResult.error) {
      if (tenantResult.error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw tenantResult.error;
    }

    // A part of the record that could not be read fails the record. Sent as an
    // empty list it read as "no team", "no notes", "0 IQD".
    for (const result of [
      walletResult,
      subscriptionResult,
      transactionsResult,
      usageResult,
      teamResult,
      notesResult,
      orderCountResult,
      planLimitsResult,
    ]) {
      if (result.error) throw result.error;
    }

    const tenant = tenantResult.data;
    const planLimits = (planLimitsResult.data ?? []).find(
      (p: { plan: string }) => p.plan === tenant.plan
    ) ?? null;

    return NextResponse.json({
      tenant,
      wallet: walletResult.data ?? null,
      subscription: subscriptionResult.data ?? null,
      transactions: transactionsResult.data ?? [],
      usage: usageResult.data ?? [],
      team: teamResult.data ?? [],
      notes: notesResult.data ?? [],
      orderCount: orderCountResult.count ?? 0,
      planLimits,
      billingLock,
      // A free unlock grants paid time without a payment: super admins only.
      canForceUnlock: hasPermission(auth.role, "manage_subscription"),
    });
  } catch (error) {
    console.error("Merchant detail API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchant details" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Status, plan and auto-renew of a shop: `change_plan`, a super_admin
  // permission (as `suspend_tenant` and `reactivate_tenant` are).
  const auth = await requireAdminPermission(request, "change_plan");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    // The database checks the change, writes the shop, its subscription and
    // the staff log rows in one transaction, and says why when it refuses.
    const result = await updateShop(createAdminClient(), id, parsed.data, auth.user);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.shop);
  } catch (error) {
    console.error("Merchant PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update merchant" },
      { status: 500 }
    );
  }
}
