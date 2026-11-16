import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireBearerAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { leadConvertedLockResponse } from "@/lib/lead-converted-lock";

const leadIds = z.array(z.uuid()).min(1, "lead_ids required").max(100, "Max 100 leads per bulk action");

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change_status"),
    lead_ids: leadIds,
    payload: z.object({ status: z.enum(["new", "contacted", "interested", "store_built", "lost"]) }),
  }),
  // The person pressing takes the leads; the id comes from the session, never the body.
  z.object({ action: z.literal("assign_to_me"), lead_ids: leadIds }),
  z.object({
    action: z.literal("change_priority"),
    lead_ids: leadIds,
    payload: z.object({ priority: z.enum(["low", "medium", "high", "urgent"]) }),
  }),
  z.object({ action: z.literal("delete"), lead_ids: leadIds }),
  z.object({
    action: z.literal("add_tag"),
    lead_ids: leadIds,
    payload: z.object({ tag: z.string().trim().min(1).max(50) }),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
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
      case "change_status": {
        const { error } = await supabase
          .from("leads")
          .update({ status: body.payload.status })
          .in("id", lead_ids);
        if (error) throw error;
        break;
      }
      case "assign_to_me": {
        const { error } = await supabase
          .from("leads")
          .update({ assigned_to: admin.user.id, assigned_at: new Date().toISOString() })
          .in("id", lead_ids);
        if (error) throw error;
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
