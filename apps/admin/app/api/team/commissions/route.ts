import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("admin_commission_config")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ configs: data ?? [] });
  } catch (error) {
    console.error("Commission configs GET error:", error);
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    if (body.id) {
      // Update existing
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.type !== undefined) updateData.type = body.type;
      if (body.config !== undefined) updateData.config = body.config;
      if (body.is_active !== undefined) {
        // If activating this one, deactivate others
        if (body.is_active) {
          await supabase
            .from("admin_commission_config")
            .update({ is_active: false })
            .neq("id", body.id);
        }
        updateData.is_active = body.is_active;
      }
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("admin_commission_config")
        .update(updateData)
        .eq("id", body.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ config: data });
    }

    // Create new
    const { data, error } = await supabase
      .from("admin_commission_config")
      .insert({
        name: body.name,
        type: body.type || "per_order",
        config: body.config || {},
        is_active: body.is_active ?? false,
        created_by: body.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ config: data }, { status: 201 });
  } catch (error) {
    console.error("Commission config POST error:", error);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
