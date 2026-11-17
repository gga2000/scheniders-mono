import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireBearerAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { leadConvertedLockResponse } from "@/lib/lead-converted-lock";
import { bulkLeadSchema } from "@/lib/lead-bulk";
import { changeLeads } from "@/lib/lead-change";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const parsed = bulkLeadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bulk action" }, { status: 400 });
    }
    const body = parsed.data;
    const { lead_ids } = body;

    // Deleting needs delete_leads; the other edits are everyday sales work.
    if (body.action === "delete" && !hasPermission(admin.role, "delete_leads")) {
      return forbidden("delete_leads");
    }

    const supabase = createAdminClient();

    switch (body.action) {
      // Status and owner follow the lead form's rule (lib/lead-change): history
      // lines, last contacted, and a reassign_lead row per lead with its "from".
      case "change_status":
      case "assign_to_me": {
        const result = await changeLeads(
          supabase,
          lead_ids,
          body.action === "change_status"
            ? { status: body.payload.status }
            : { owner: admin.user.id, takeOwned: body.take_from_others ?? false },
          admin.user,
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, ...(result.ownedByOthers ? { owned_by_others: result.ownedByOthers } : {}) },
            { status: result.status },
          );
        }
        break;
      }
      case "change_priority": {
        const { error } = await supabase
          .from("leads")
          .update({ priority: body.payload.priority })
          .in("id", lead_ids);
        if (error) throw error;
        break;
      }
      case "delete": {
        const { error } = await supabase
          .from("leads")
          .delete()
          .in("id", lead_ids);
        if (error) throw error;
        break;
      }
      case "add_tag": {
        const { tag } = body.payload;
        const { data: leads, error } = await supabase
          .from("leads")
          .select("id, tags")
          .in("id", lead_ids);
        if (error) throw error;

        for (const lead of leads ?? []) {
          const currentTags: string[] = lead.tags || [];
          if (currentTags.includes(tag)) continue;
          const { error: tagError } = await supabase
            .from("leads")
            .update({ tags: [...currentTags, tag] })
            .eq("id", lead.id);
          if (tagError) throw tagError;
        }
        break;
      }
    }

    await logAdminAction(admin, "bulk_leads", {
      details: { action: body.action, count: lead_ids.length, lead_ids },
    });

    return NextResponse.json({ success: true, affected: lead_ids.length });
  } catch (error) {
    const locked = leadConvertedLockResponse(error);
    if (locked) return locked;
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
