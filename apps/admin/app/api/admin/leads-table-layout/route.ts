import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import {
  LEADS_TABLE_LAYOUT_KEY,
  layoutSchema,
  resolveLeadLayout,
  serializeLayout,
} from "@/lib/leads-table-layout";

/**
 * Org-wide Prospects-table layout (column order / width / visibility), shared by
 * every employee.
 *   GET  — any active admin (super_admin + support_staff) reads the saved layout.
 *   PUT  — super_admin only ("update_settings"); persists the layout for everyone.
 *
 * Storage is the existing `admin_settings` JSONB key/value table (RLS: service
 * role only), so all access goes through the service-role client here.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("admin_settings")
      .select("value, updated_at")
      .eq("key", LEADS_TABLE_LAYOUT_KEY)
      .maybeSingle();

    if (error) throw error;

    // Validate the stored JSON defensively; an unparseable row falls back to
    // defaults rather than 500-ing the table.
    const parsed = data ? layoutSchema.safeParse(data.value) : null;
    return NextResponse.json({
      layout: parsed?.success ? parsed.data : null,
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    console.error("Leads table layout GET error:", err);
    return NextResponse.json({ error: "Failed to load layout" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  const json = await request.json().catch(() => null);
  const parsed = layoutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid layout", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Persist the CANONICAL form (deduped, clamped, unknown ids dropped, merchant
  // pinned), so a crafted-but-shape-valid body can never poison the stored row.
  const normalized = serializeLayout(resolveLeadLayout(parsed.data));

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("admin_settings").upsert(
      {
        key: LEADS_TABLE_LAYOUT_KEY,
        value: normalized,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) throw error;

    return NextResponse.json({ success: true, layout: normalized });
  } catch (err) {
    console.error("Leads table layout PUT error:", err);
    return NextResponse.json({ error: "Failed to save layout" }, { status: 500 });
  }
}
