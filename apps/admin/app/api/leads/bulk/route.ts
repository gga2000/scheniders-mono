import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";

const leadIds = z.array(z.uuid()).min(1, "lead_ids required").max(100, "Max 100 leads per bulk action");

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change_status"),
    lead_ids: leadIds,
    payload: z.object({ status: z.enum(["new", "contacted", "interested", "store_built", "lost"]) }),
  }),
  z.object({
    action: z.literal("assign"),
    lead_ids: leadIds,
    payload: z.object({ assigned_to: z.uuid().nullable() }),
  }),
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
      return NextResponse.json({ error: 'Forbidden: missing permission "delete_leads"' }, { status: 403 });
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
      case "assign": {
        const { error } = await supabase
          .from("leads")
          .update({
            assigned_to: body.payload.assigned_to,
            assigned_at: body.payload.assigned_to ? new Date().toISOString() : null,
          })
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

    return NextResponse.json({ success: true, affected: lead_ids.length });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
