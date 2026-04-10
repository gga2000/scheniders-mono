import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("whatsapp_outreach_templates")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("Templates GET error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("whatsapp_outreach_templates")
      .insert({
        name: body.name,
        stage: body.stage,
        message_template: body.message_template,
        created_by: body.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    console.error("Templates POST error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
