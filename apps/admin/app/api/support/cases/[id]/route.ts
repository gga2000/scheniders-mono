import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { adminDisplayName } from "@/lib/support-admin-name";
import { logAdminActivity } from "@/lib/activity-logger";
import { lastDaysStart } from "@/lib/baghdad-day";
import {
  CaseActionSchema,
  SUPPORT_CASE_COLUMNS,
  SUPPORT_CASE_NOTE_COLUMNS,
  SUPPORT_SHOT_BUCKET,
  SUPPORT_VOICE_BUCKET,
  filePaths,
  supportRefusal,
  type SupportCaseNote,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportShopCard,
} from "@/lib/support";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long a link to a merchant's picture or voice note works; the page refetches every few seconds. */
const FILE_LINK_SECONDS = 15 * 60;

type AdminDb = ReturnType<typeof createAdminClient>;

/** Whether the shop's month renews: the card says "Renews" only when it will. */
const subscriptionSchema = z.object({
  status: z.string(),
  plan: z.string(),
  auto_renew: z.boolean(),
  current_period_end: z.string().nullable(),
});

/** Signed links for every path in one call; a file that is gone has no link. */
async function signPaths(supabase: AdminDb, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (paths.length === 0) return links;
  const signed = await supabase.storage.from(bucket).createSignedUrls(paths, FILE_LINK_SECONDS);
  if (signed.error) throw signed.error;
  for (const link of signed.data ?? []) {
    if (link.path && link.signedUrl && !link.error) links.set(link.path, link.signedUrl);
  }
  return links;
}

async function loadShopCard(
  supabase: AdminDb,
  tenantId: string,
  caseId: string,
  adminId: string,
): Promise<SupportShopCard> {
  // Real orders (admin_order_facts: no deleted, draft or test rows, never
  // the demo shop), and the week is 7 Baghdad days with today, as on the
  // Merchants list. It counted every orders row over 7 × 24 hours before.
  const weekStart = lastDaysStart(7);
  const [tenant, wallet, subscription, ordersWeek, ordersTotal, team, notes, earlier, owner, calls] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, business_name, display_id, plan, status, restrictions, city, contact_phone, trial_ends_at, created_at, is_demo")
      .eq("id", tenantId)
      .single(),
    supabase.from("wallet").select("balance_iqd").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("subscriptions").select("status, plan, auto_renew, current_period_end").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("admin_order_facts")
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", weekStart),
    supabase.from("admin_order_facts").select("tenant_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
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
    supabase.from("support_shop_owners").select("admin_id, admin_users(display_name)").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("support_calls")
      .select("admin_name, outcome, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  for (const result of [tenant, wallet, subscription, ordersWeek, ordersTotal, team, notes, earlier, owner, calls]) {
    if (result.error) throw result.error;
  }

  const balance = (wallet.data as { balance_iqd: number | string } | null)?.balance_iqd;
  const ownerRow = owner.data as { admin_id: string; admin_users: { display_name: string | null } | null } | null;
  return {
    tenant: tenant.data as SupportShopCard["tenant"],
    walletBalanceIqd: balance === undefined || balance === null ? null : Number(balance),
    subscription: subscriptionSchema.nullable().parse(subscription.data),
    ordersLast7Days: ordersWeek.count ?? 0,
    ordersTotal: ordersTotal.count ?? 0,
    teamSize: team.count ?? 0,
    pinnedNotes: (notes.data ?? []) as SupportShopCard["pinnedNotes"],
    earlierCases: (earlier.data ?? []) as SupportShopCard["earlierCases"],
    owner: ownerRow
      ? { name: ownerRow.admin_users?.display_name?.trim() || "Support", isMe: ownerRow.admin_id === adminId }
      : null,
    calls: (calls.data ?? []) as SupportShopCard["calls"],
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

    // The messages and notes need only the conversation's id, so they are read
    // with the conversation itself: one round trip less to open a conversation.
    const [caseRead, messages, notes] = await Promise.all([
      supabase.from("support_cases").select(SUPPORT_CASE_COLUMNS).eq("id", id).maybeSingle(),
      supabase
        .from("support_messages")
        .select("id, case_id, sender_kind, sender_name, body, context, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("support_case_notes")
        .select(SUPPORT_CASE_NOTE_COLUMNS)
        .eq("case_id", id)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    if (caseRead.error) throw caseRead.error;
    if (!caseRead.data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (messages.error) throw messages.error;
    if (notes.error) throw notes.error;
    const supportCase = caseRead.data as unknown as SupportCaseRow;

    const rows = (messages.data ?? []) as Omit<SupportMessageRow, "screenshot_url" | "voice_url">[];
    const [shop, shotLinks, voiceLinks] = await Promise.all([
      loadShopCard(supabase, supportCase.tenant_id, id, auth.user.id),
      signPaths(supabase, SUPPORT_SHOT_BUCKET, filePaths(rows, supportCase.tenant_id, "screenshot")),
      signPaths(supabase, SUPPORT_VOICE_BUCKET, filePaths(rows, supportCase.tenant_id, "voice")),
    ]);

    return NextResponse.json({
      case: supportCase,
      messages: rows.map(
        (row): SupportMessageRow => ({
          ...row,
          screenshot_url: row.context.screenshot ? (shotLinks.get(row.context.screenshot) ?? null) : null,
          voice_url: row.context.voice ? (voiceLinks.get(row.context.voice) ?? null) : null,
        }),
      ),
      notes: (notes.data ?? []) as SupportCaseNote[],
      shop,
    });
  } catch (error) {
    console.error("Support case API error:", error);
    return NextResponse.json({ error: "Failed to load the conversation" }, { status: 500 });
  }
}

/**
 * Reply to the merchant, take the conversation, hand it to a teammate, add a
 * staff-only note, mark it seen, or mark it solved.
 */
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

    if (input.action === "seen") {
      const { data, error } = await supabase.rpc("support_staff_mark_seen", {
        p_case_id: id,
        p_admin_name: adminName,
      });
      const refusal = supportRefusal(error);
      if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
      if (error) throw error;
      return NextResponse.json({ success: true, moved: data === true });
    }

    if (input.action === "note" || input.action === "hand_over") {
      const { data, error } =
        input.action === "note"
          ? await supabase.rpc("support_case_add_note", {
              p_case_id: id,
              p_admin_id: auth.user.id,
              p_admin_name: adminName,
              p_body: input.body,
            })
          : await supabase.rpc("support_case_hand_over", {
              p_case_id: id,
              p_admin_id: auth.user.id,
              p_admin_name: adminName,
              p_to_admin_id: input.toAdminId,
              p_note: input.note ?? null,
            });
      const refusal = supportRefusal(error);
      if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
      if (error) throw error;

      // Notes are their own record; handing over moves who answers, so it is audited.
      if (input.action === "hand_over") {
        const handed = data as { tenant_id: string; to_name: string };
        await logAdminActivity({
          adminUserId: auth.user.id,
          actorEmail: auth.user.email,
          tenantId: handed.tenant_id,
          action: "support_case_handed_over",
          details: { case_id: id, to_admin_id: input.toAdminId, to_name: handed.to_name },
        });
      }
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
