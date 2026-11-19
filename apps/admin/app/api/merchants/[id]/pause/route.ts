import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";
import { pausedShop } from "@/lib/tenant-pause";
import { DEMO_STORE_REFUSAL } from "@/lib/shop-update";
import { notAnId } from "@/lib/route-id";
import { staffReasonSchema } from "@/lib/staff-reason";

const PauseSchema = z.object({
  duration_days: z.number().int().positive().max(365).optional(),
  paused_until: z.string().datetime().optional(),
  // The shop page shows it ("Reason: ..."), so it holds to the rule every
  // staff reason does: 3 letters in any script (round 19).
  reason: staffReasonSchema,
  blocks: z
    .object({
      new_orders: z.boolean().optional(),
      new_products: z.boolean().optional(),
      team_invites: z.boolean().optional(),
      storefront_writes: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Restricts the merchant (status -> limited) — super_admin only.
  const auth = await requireAdminPermission(request, "suspend_tenant");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PauseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const now = new Date();

    let pausedUntil: string | null = null;
    if (parsed.data.paused_until) {
      pausedUntil = parsed.data.paused_until;
    } else if (parsed.data.duration_days) {
      const dt = new Date(now.getTime() + parsed.data.duration_days * 24 * 60 * 60 * 1000);
      pausedUntil = dt.toISOString();
    }

    const restrictions = {
      paused_at: now.toISOString(),
      // The admin's uuid, per the documented restrictions schema. Never the
      // email: tenant members can read tenants.restrictions, and the email is
      // already in admin_activity_logs.actor_email (admin-only).
      paused_by: auth.user.id,
      paused_until: pausedUntil,
      reason: parsed.data.reason,
      blocks: {
        new_orders: parsed.data.blocks?.new_orders ?? true,
        new_products: parsed.data.blocks?.new_products ?? false,
        team_invites: parsed.data.blocks?.team_invites ?? false,
        storefront_writes: parsed.data.blocks?.storefront_writes ?? false,
      },
    };

    // The database sets "limited" and, in the same statement, keeps the status
    // the pause replaces (restrictions.status_before), so lifting the pause can
    // give it back. A trial shop must come back as a trial, not as a paying shop.
    const { data: rows, error } = await supabase.rpc("pause_tenant", {
      _tenant_id: id,
      _restrictions: restrictions,
    });
    if (error) throw error;

    const data = pausedShop(rows);
    if (!data) {
      // No row: the shop does not exist, or it is the demo store, which the
      // database never pauses. The read only picks the words; it writes nothing.
      const { data: shops, error: readError } = await supabase.from("tenants").select("is_demo").eq("id", id);
      if (readError) throw readError;
      if (!shops || shops.length === 0) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      if (shops[0].is_demo === true) {
        return NextResponse.json({ error: DEMO_STORE_REFUSAL }, { status: 409 });
      }
      throw new Error("pause_tenant paused nothing for a shop that is not the demo store");
    }

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id,
      action: "pause_tenant",
      details: { restrictions: data.restrictions, duration_days: parsed.data.duration_days ?? null },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Pause merchant error:", error);
    return NextResponse.json({ error: "Failed to pause merchant" }, { status: 500 });
  }
}
