import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";

const UpdateTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
});

/** Postgres: the shop the row points at does not exist. */
const NO_SUCH_SHOP = "23503";

/**
 * Replaces a shop's staff tags. They are kept in staff_shop_tags, which only
 * the console's server can read: a merchant reads their own tenants row, so
 * a label like "At Risk" never goes there.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "manage_tags");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const body = await request.json();
    const parsed = UpdateTagsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // The same tag twice is one tag.
    const tags = [...new Set(parsed.data.tags)];
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("staff_shop_tags")
      .upsert({ tenant_id: id, tags, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" })
      .select("tags")
      .single();

    if (error) {
      if (error.code === NO_SUCH_SHOP) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    await logAdminAction(auth, "update_tags", { tenantId: id, details: { tags: data.tags } });

    return NextResponse.json({ tags: data.tags });
  } catch (error) {
    console.error("Tags API error:", error);
    return NextResponse.json(
      { error: "Failed to update tags" },
      { status: 500 }
    );
  }
}
