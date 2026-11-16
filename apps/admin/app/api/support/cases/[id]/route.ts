import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission, type AdminContext } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import {
  CaseActionSchema,
  SUPPORT_CASE_COLUMNS,
  supportRefusal,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportShopCard,
} from "@/lib/support";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminDb = ReturnType<typeof createAdminClient>;

/** The name merchants and teammates see on this admin's replies. */
async function adminDisplayName(supabase: AdminDb, admin: AdminContext): Promise<string> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("display_name, email")
    .eq("user_id", admin.user.id)
    .maybeSingle();
  if (error) throw error;
  const row = data as { display_name: string | null; email: string | null } | null;
  return row?.display_name?.trim() || row?.email || admin.user.email || "Support";
}

async function loadShopCard(supabase: AdminDb, tenantId: string, caseId: string): Promise<SupportShopCard> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [tenant, wallet, subscription, ordersWeek, ordersTotal, team, notes, earlier] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, business_name, display_id, plan, status, city, contact_phone, trial_ends_at, created_at")
      .eq("id", tenantId)
      .single(),
    supabase.from("wallet").select("balance_iqd").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("subscriptions").select("current_period_end").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", weekAgo),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("admin_notes")
      .select("id, content, created_at")
      .eq("tenant_id", tenantId)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("support_cases")
      .select("id, status, reason, created_at")
      .eq("tenant_id", tenantId)
      .neq("id", caseId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  for (const result of [tenant, wallet, subscription, ordersWeek, ordersTotal, team, notes, earlier]) {
    if (result.error) throw result.error;
  }

  const balance = (wallet.data as { balance_iqd: number | string } | null)?.balance_iqd;
  return {
    tenant: tenant.data as SupportShopCard["tenant"],
    walletBalanceIqd: balance === undefined || balance === null ? null : Number(balance),
    subscriptionEndsAt:
      (subscription.data as { current_period_end: string | null } | null)?.current_period_end ?? null,
    ordersLast7Days: ordersWeek.count ?? 0,
    ordersTotal: ordersTotal.count ?? 0,
    teamSize: team.count ?? 0,
    pinnedNotes: (notes.data ?? []) as SupportShopCard["pinnedNotes"],
    earlierCases: (earlier.data ?? []) as SupportShopCard["earlierCases"],
  };
}

/** One conversation: its messages and the shop card beside it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "handle_support");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  try {
    const supabase = createAdminClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("support_cases")
      .select(SUPPORT_CASE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (caseError) throw caseError;
    if (!caseRow) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const supportCase = caseRow as unknown as SupportCaseRow;

    const [messages, shop] = await Promise.all([
      supabase
        .from("support_messages")
        .select("id, case_id, sender_kind, sender_name, body, context, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true })
        .limit(500),
      loadShopCard(supabase, supportCase.tenant_id, id),
    ]);
    if (messages.error) throw messages.error;

    return NextResponse.json({
      case: supportCase,
      messages: (messages.data ?? []) as SupportMessageRow[],
      shop,
    });
  } catch (error) {
    console.error("Support case API error:", error);
    return NextResponse.json({ error: "Failed to load the conversation" }, { status: 500 });
  }
}

/** Reply to the merchant, take the conversation, or mark it solved. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "handle_support");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const parsed = CaseActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const supabase = createAdminClient();
    const adminName = await adminDisplayName(supabase, auth);

    if (input.action === "assign") {
      const { data, error } = await supabase
        .from("support_cases")
        .update({ owner_admin_id: auth.user.id, owner_name: adminName, updated_at: new Date().toISOString() })
        .eq("id", id)
        .neq("status", "solved")
        .select("id, tenant_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: "This conversation is solved or no longer exists." }, { status: 409 });
      }
      await logAdminActivity({
        adminUserId: auth.user.id,
        actorEmail: auth.user.email,
        tenantId: (data as { tenant_id: string }).tenant_id,
        action: "support_case_assigned",
        details: { case_id: id },
      });
      return NextResponse.json({ success: true });
    }

    const { data, error } =
      input.action === "reply"
        ? await supabase.rpc("support_staff_reply", {
            p_case_id: id,
            p_admin_id: auth.user.id,
            p_admin_name: adminName,
            p_body: input.body,
          })
        : await supabase.rpc("support_staff_solve", {
            p_case_id: id,
            p_admin_id: auth.user.id,
            p_admin_name: adminName,
            p_reason: input.reason,
          });

    const refusal = supportRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    // Replies are already on record as messages; solving is the audited step.
    if (input.action === "solve") {
      await logAdminActivity({
        adminUserId: auth.user.id,
        actorEmail: auth.user.email,
        tenantId: (data as { tenant_id: string }).tenant_id,
        action: "support_case_solved",
        details: { case_id: id, reason: input.reason },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support case action error:", error);
    return NextResponse.json({ error: "Failed to update the conversation" }, { status: 500 });
  }
}
