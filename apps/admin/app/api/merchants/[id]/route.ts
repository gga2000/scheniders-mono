import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { readBillingLock } from "@/lib/billing-lock-tools";
import { logActor } from "@/lib/shop-timeline";
import { updateShop } from "@/lib/shop-update";
import { z } from "zod";
import { PLAN_TIERS } from "@/types/admin";
import { notAnId } from "@/lib/route-id";
import { staffReasonSchema } from "@/lib/staff-reason";
import { SHOP_COLUMNS } from "@/lib/shop-columns";
import { shopHealth } from "@/lib/shop-health-score";

const patchSchema = z
  .object({
    status: z.enum(["active", "trial", "limited", "suspended", "cancelled"]).optional(),
    plan: z.enum(PLAN_TIERS).optional(),
    auto_renew: z.boolean().optional(),
    // Staff's words, kept on the staff log rows. The shop page and the
    // Merchants card plan chip ask for them; the card's status menu (the
    // owner's page) does not yet, so a status change may come without one.
    reason: staffReasonSchema.optional(),
  })
  .refine((d) => d.status || d.plan || typeof d.auto_renew === "boolean", {
    message: "At least one field required",
  })
  // Stopping renewal ends the shop's paid months; only the shop page sends it.
  .refine((d) => d.auto_renew !== false || d.reason, {
    message: "Say why renewal stops.",
    path: ["reason"],
  })
  // A plan decides what the shop pays each month. Every form that moves one
  // asks why (the shop page, the card's plan chip, bulk Change Plan).
  .refine((d) => !d.plan || d.reason, {
    message: "Say why the plan changes.",
    path: ["reason"],
  });

/**
 * A member row with the member's own profile. `tenant_members` has two keys to
 * `user_profiles` (the member and whoever invited them), so the embed names one.
 */
const TEAM_COLUMNS =
  "id, user_id, role, status, invited_at, joined_at, user_profiles!tenant_members_user_id_fkey(email, display_name, avatar_url)";

const paidMonthsSchema = z.array(z.object({ paid_at: z.string(), paid_until: z.string() }));

/**
 * The shop's charged plan months, by the Paying page's one rule
 * (paid_plan_months): when it was first charged, and until when its latest
 * charged month runs. A running subscription can be free time (a converted
 * lead, free days, a free unlock), so the page says "Paying" only while a
 * charged month covers now (round 18).
 */
async function readPaidPlan(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<{ first_paid_at: string | null; paid_until: string | null }> {
  const { data, error } = await supabase.rpc("paid_plan_months").eq("tenant_id", tenantId);
  if (error) throw error;
  const months = paidMonthsSchema.parse(data);
  const at = (iso: string) => Date.parse(iso);
  return {
    first_paid_at: months.reduce<string | null>((first, m) => (first === null || at(m.paid_at) < at(first) ? m.paid_at : first), null),
    paid_until: months.reduce<string | null>((last, m) => (last === null || at(m.paid_until) > at(last) ? m.paid_until : last), null),
  };
}

/** The staff steps that put a shop on hold, or pause it. */
const STOP_ACTIONS: Record<string, readonly string[]> = {
  suspended: ["suspend", "bulk_suspend", "status_change"],
  limited: ["pause_tenant"],
};

/**
 * Who stopped a shop by hand and when (board m9): the newest log row of the
 * step that put it where it is now. Null for a running shop, or when the log
 * has no such step.
 */
async function readStoppedBy(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  status: string,
): Promise<{ who: string; at: string } | null> {
  const actions = STOP_ACTIONS[status];
  if (!actions) return null;
  const { data, error } = await supabase
    .from("admin_activity_logs")
    .select("admin_user_id, admin_label, actor_email, action, details, created_at")
    .eq("tenant_id", tenantId)
    .in("action", actions)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const row = (data ?? []).find(
    (entry) => entry.action !== "status_change" || (entry.details as { status?: unknown } | null)?.status === "suspended",
  );
  if (!row) return null;
  const names = new Map<string, string>();
  if (row.admin_user_id) {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, display_name, email")
      .eq("id", row.admin_user_id)
      .maybeSingle();
    if (profileError) throw profileError;
    const name = profile?.display_name?.trim() || profile?.email;
    if (profile && name) names.set(profile.id, name);
  }
  return { who: logActor(row, names), at: row.created_at };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const supabase = createAdminClient();

    const [
      tenantResult,
      walletResult,
      subscriptionResult,
      usageResult,
      teamResult,
      notesResult,
      orderCountResult,
      planLimitsResult,
      billingLock,
      paidPlan,
    ] = await Promise.all([
      // The health parts, as the list reads them; the score is their sum (lib/shop-health-score).
      supabase
        .from("tenants")
        .select(`${SHOP_COLUMNS}, store_config_rev, staff_health_parts, is_demo`)
        .eq("id", id)
        .single(),
      // A shop built from a lead may have no wallet or subscription yet: no row is not an error.
      supabase.from("wallet").select("*").eq("tenant_id", id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("tenant_id", id).maybeSingle(),
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
      readPaidPlan(supabase, id),
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
      usageResult,
      teamResult,
      notesResult,
      orderCountResult,
      planLimitsResult,
    ]) {
      if (result.error) throw result.error;
    }

    const { staff_health_parts: healthParts, ...shop } = tenantResult.data;
    const tenant = { ...shop, ...shopHealth(healthParts) };
    const stoppedBy = await readStoppedBy(supabase, id, tenant.status);
    const planLimits = (planLimitsResult.data ?? []).find(
      (p: { plan: string }) => p.plan === tenant.plan
    ) ?? null;

    return NextResponse.json({
      tenant,
      wallet: walletResult.data ?? null,
      subscription: subscriptionResult.data ?? null,
      usage: usageResult.data ?? [],
      team: teamResult.data ?? [],
      notes: notesResult.data ?? [],
      orderCount: orderCountResult.count ?? 0,
      planLimits,
      billingLock,
      paidPlan,
      // A free unlock grants paid time without a payment: super admins only.
      canForceUnlock: hasPermission(auth.role, "manage_subscription"),
      stoppedBy,
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
  const missing = notAnId(id);
  if (missing) return missing;

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
