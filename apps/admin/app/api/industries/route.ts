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

/** The row admin_add_industry answers; the hook and the list read these fields. */
const addedSchema = z.object({
  id: z.string(),
  name: z.string(),
  name_ar: z.string().nullable(),
  icon: z.string(),
  color: z.string(),
  avg_order_value_iqd: z.number(),
  is_active: z.boolean(),
  sort_order: z.number(),
  created_at: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("industries")
      .select("*")
      // As admin_move_industry reads the list: ties broken the same way, so a
      // move goes past the neighbour staff see.
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ industries: data ?? [] });
  } catch (error) {
    console.error("Industries GET error:", error);
    return NextResponse.json({ error: "Failed to fetch industries" }, { status: 500 });
  }
}

/**
 * Adds an industry through admin_add_industry: one transaction puts it just
 * before "Other" (it took the column default 0 and landed first, above every
 * other industry) and writes the staff log row. A name already in the list
 * is refused, so two staff adding it at once get one industry.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminPermission(request, "update_settings");
    if (admin instanceof NextResponse) return admin;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("admin_add_industry", {
      _name: parsed.data.name,
      _name_ar: parsed.data.name_ar ?? null,
      _icon: parsed.data.icon,
      _color: parsed.data.color,
      _avg_order_value_iqd: parsed.data.avg_order_value_iqd,
      _admin_user_id: admin.user.id,
      _email: admin.user.email ?? null,
    });
    // One industry per name (industries_name_key: trimmed, in any case).
    if (error?.code === "23505") {
      return NextResponse.json({ error: "An industry with this name already exists." }, { status: 409 });
    }
    if (error) throw error;

    return NextResponse.json({ industry: addedSchema.parse(data) }, { status: 201 });
  } catch (error) {
    console.error("Industries POST error:", error);
    return NextResponse.json({ error: "Failed to create industry" }, { status: 500 });
  }
}
