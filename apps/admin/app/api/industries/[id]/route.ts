import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    name_ar: z.string().trim().max(100).nullable(),
    icon: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    avg_order_value_iqd: z.number().int().min(0),
    is_active: z.boolean(),
    sort_order: z.number().int(),
  })
  .partial();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminPermission(request, "update_settings");
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ industry: data });
  } catch (error) {
    console.error("Industry PATCH error:", error);
    return NextResponse.json({ error: "Failed to update industry" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminPermission(_request, "update_settings");
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const supabase = createAdminClient();

    // Check how many leads reference this industry
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("industry_id", id);

    if (count && count > 0) {
      // Soft delete: deactivate
      const { error } = await supabase
        .from("industries")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        warning: `Industry deactivated. ${count} leads still reference it.`,
        affected_leads: count,
      });
    }

    // Hard delete if no references
    const { error } = await supabase
      .from("industries")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Industry DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete industry" }, { status: 500 });
  }
}
