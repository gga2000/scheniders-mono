import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission, requireBearerAdmin } from "@/lib/api-auth";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  name_ar: z.string().trim().max(100).nullish(),
  icon: z.string().trim().min(1).max(60).default("Building2"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6B7280"),
  avg_order_value_iqd: z.number().int().min(0).default(25000),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

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
    const admin = await requireAdminPermission(request, "update_settings");
    if (admin instanceof NextResponse) return admin;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .insert({ ...parsed.data, name_ar: parsed.data.name_ar || null })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ industry: data }, { status: 201 });
  } catch (error) {
    console.error("Industries POST error:", error);
    return NextResponse.json({ error: "Failed to create industry" }, { status: 500 });
  }
}
