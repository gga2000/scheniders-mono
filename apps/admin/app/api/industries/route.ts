import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ industries: data ?? [] });
  } catch (error) {
    console.error("Industries GET error:", error);
    return NextResponse.json({ error: "Failed to fetch industries" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .insert({
        name: body.name,
        name_ar: body.name_ar || null,
        icon: body.icon || "Building2",
        color: body.color || "#6B7280",
        avg_order_value_iqd: body.avg_order_value_iqd || 25000,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ industry: data }, { status: 201 });
  } catch (error) {
    console.error("Industries POST error:", error);
    return NextResponse.json({ error: "Failed to create industry" }, { status: 500 });
  }
}
