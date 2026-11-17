import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    name_ar: z.string().trim().max(100).nullable(),
    icon: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    avg_order_value_iqd: z.number().int().min(0),
    is_active: z.boolean(),
  })
  // The place in the list changes only through /move, which renumbers the
  // whole list in one write. A sort_order set here could share a number.
  .partial()
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminPermission(request, "update_settings");
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
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
      .maybeSingle();

    // A rename onto another industry's name (industries_name_key).
    if (error?.code === "23505") {
      return NextResponse.json({ error: "An industry with this name already exists." }, { status: 409 });
    }
    if (error) throw error;
    // A colleague removed it first: said as Delete and Move say it, not a 500.
    if (!data) return NextResponse.json({ error: "This industry no longer exists." }, { status: 404 });

    await logAdminAction(admin, "update_settings", {
      details: { setting: "industries", change: "edited", industry_id: id, fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ industry: data });
  } catch (error) {
    console.error("Industry PATCH error:", error);
    return NextResponse.json({ error: "Failed to update industry" }, { status: 500 });
  }
}

const removeResultSchema = z.union([
  z.object({ success: z.literal(true), result: z.literal("removed") }),
  z.object({ success: z.literal(true), result: z.literal("switched_off"), leads_using_it: z.number().int().positive() }),
  z.object({ success: z.literal(false), error: z.literal("not_found") }),
]);

/**
 * DELETE /api/industries/[id]: removes an industry no lead uses, or switches
 * off one that leads use (they keep it). The database counts the leads,
 * removes or switches off, and writes the staff log row in one transaction.
 * The route used to count first and ignore a failed count: the industry was
 * then removed, and the database cleared it from every lead that used it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminPermission(request, "update_settings");
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const { data, error } = await createAdminClient().rpc("admin_remove_industry", {
      _industry_id: id,
      _admin_user_id: admin.user.id,
      _email: admin.user.email ?? null,
    });
    if (error) throw error;

    const answer = removeResultSchema.parse(data);
    if (!answer.success) {
      return NextResponse.json({ error: "This industry no longer exists." }, { status: 404 });
    }
    if (answer.result === "switched_off") {
      return NextResponse.json({ result: "switched_off", leads_using_it: answer.leads_using_it });
    }
    return NextResponse.json({ result: "removed" });
  } catch (error) {
    console.error("Industry DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete industry" }, { status: 500 });
  }
}
