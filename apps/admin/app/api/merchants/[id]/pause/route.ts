import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";

const PauseSchema = z.object({
  duration_days: z.number().int().positive().max(365).optional(),
  paused_until: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
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
      paused_by: auth.user.email ?? auth.user.id,
      paused_until: pausedUntil,
      reason: parsed.data.reason ?? null,
      blocks: {
        new_orders: parsed.data.blocks?.new_orders ?? true,
        new_products: parsed.data.blocks?.new_products ?? false,
        team_invites: parsed.data.blocks?.team_invites ?? false,
        storefront_writes: parsed.data.blocks?.storefront_writes ?? false,
      },
    };

    const { data, error } = await supabase
      .from("tenants")
      .update({ status: "limited", restrictions })
      .eq("id", id)
      .select("id, status, restrictions")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id,
      action: "pause_tenant",
      details: { restrictions, duration_days: parsed.data.duration_days ?? null },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Pause merchant error:", error);
    return NextResponse.json({ error: "Failed to pause merchant" }, { status: 500 });
  }
}
