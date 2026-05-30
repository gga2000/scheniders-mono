import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("admin_settings")
      .select("key, value, updated_at");

    if (error) throw error;

    return NextResponse.json({ settings: data ?? [] });
  } catch (error) {
    console.error("Settings API GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    if (!key || typeof value !== "string") {
      return NextResponse.json(
        { error: "Missing required fields: key, value" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("admin_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings API POST error:", error);
    return NextResponse.json(
      { error: "Failed to save setting" },
      { status: 500 }
    );
  }
}
