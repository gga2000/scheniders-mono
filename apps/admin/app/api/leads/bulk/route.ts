import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireBearerAdmin, type AdminContext } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { convertedLeadsMessage, isConvertedLock } from "@/lib/lead-converted-lock";
import { bulkLeadSchema, type BulkLeadResult } from "@/lib/lead-bulk";
import { changeLeads, type LeadChange } from "@/lib/lead-change";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * The Leads bulk bar. Each press answers and logs what really changed: a lead
 * already in that state, or deleted meanwhile, is not counted as changed.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const parsed = bulkLeadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bulk action" }, { status: 400 });
    }
    const body = parsed.data;
    // Deleting needs delete_leads; the other steps are everyday sales work.
    if (body.action === "delete" && !hasPermission(admin.role, "delete_leads")) {
      return forbidden("delete_leads");
    }
    const supabase = createAdminClient();

    switch (body.action) {
      case "change_status":
        return await changeTicked(supabase, admin, body.lead_ids, { status: body.payload.status });
      case "assign_to_me":
        return await changeTicked(supabase, admin, body.lead_ids, {
          owner: admin.user.id,
          takeOwned: body.take_from_others ?? false,
        });
      case "delete":
        return await deleteTicked(supabase, admin, body.lead_ids);
    }
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}

/**
 * Status and owner follow the lead form's rule (lib/lead-change): a history
 * line per changed lead, last contacted, and a reassign_lead row per moved
 * lead with its name and its "from", written by the database. A status change
 * has no such row, so one row here says how many leads moved to which status.
 */
async function changeTicked(
  supabase: Supabase,
  admin: AdminContext,
  leadIds: string[],
  change: LeadChange,
): Promise<NextResponse> {
  let result: Awaited<ReturnType<typeof changeLeads>>;
  try {
    result = await changeLeads(supabase, leadIds, change, admin.user);
  } catch (error) {
    if (!isConvertedLock(error)) throw error;
    return NextResponse.json({ error: convertedLeadsMessage(await storesAmong(supabase, leadIds)) }, { status: 409 });
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.ownedByOthers ? { owned_by_others: result.ownedByOthers } : {}) },
      { status: result.status },
    );
  }

  const changed = change.status !== undefined ? result.statusChanged : result.moved;
  if (change.status !== undefined && changed > 0) {
    await logAdminAction(admin, "bulk_leads", { details: { action: "change_status", status: change.status, changed } });
  }
  return answer({ success: true, found: result.found, changed });
}

/** A deleted lead takes its history with it: the log row keeps each name, as for one lead. */
async function deleteTicked(supabase: Supabase, admin: AdminContext, leadIds: string[]): Promise<NextResponse> {
  const { data, error } = await supabase.from("leads").delete().in("id", leadIds).select("id, merchant_name");
  if (error) throw error;
  const removed = data ?? [];
  if (removed.length > 0) {
    await logAdminAction(admin, "bulk_leads", {
      details: {
        action: "delete",
        changed: removed.length,
        leads: removed.map(({ id, merchant_name }) => ({ id, merchant_name })),
      },
    });
  }
  return answer({ success: true, found: removed.length, changed: removed.length });
}

/** The ticked leads that are already stores, by name, for the refusal. */
async function storesAmong(supabase: Supabase, leadIds: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("merchant_name")
    .in("id", leadIds)
    .not("converted_tenant_id", "is", null)
    .order("merchant_name");
  if (error) throw error;
  return (data ?? []).map((lead) => lead.merchant_name);
}

function answer(result: BulkLeadResult): NextResponse {
  return NextResponse.json(result);
}
