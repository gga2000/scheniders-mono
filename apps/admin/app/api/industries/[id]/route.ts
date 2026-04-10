import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .update(body)
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
