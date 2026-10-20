import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = await request.json();
    const { lead_ids, action, payload } = body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: "lead_ids required" }, { status: 400 });
    }

    if (lead_ids.length > 100) {
      return NextResponse.json({ error: "Max 100 leads per bulk action" }, { status: 400 });
    }

    const supabase = createAdminClient();

    switch (action) {
      case "change_status": {
        const { error } = await supabase
          .from("leads")
          .update({ status: payload?.status })
          .in("id", lead_ids);
        if (error) throw error;
        break;
      }
      case "assign": {
        const { error } = await supabase
          .from("leads")
          .update({
            assigned_to: payload?.assigned_to,
            assigned_at: payload?.assigned_to ? new Date().toISOString() : null,
          })
          .in("id", lead_ids);
        if (error) throw error;
        break;
      }
      case "change_priority": {
        const { error } = await supabase
          .from("leads")
          .update({ priority: payload?.priority })
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
        // Fetch current tags, append new one
        const { data: leads } = await supabase
          .from("leads")
          .select("id, tags")
          .in("id", lead_ids);

        if (leads) {
          for (const lead of leads) {
            const currentTags = lead.tags || [];
            if (!currentTags.includes(payload?.tag)) {
              await supabase
                .from("leads")
                .update({ tags: [...currentTags, payload?.tag] })
                .eq("id", lead.id);
            }
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, affected: lead_ids.length });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
