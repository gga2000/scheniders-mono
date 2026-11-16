import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { addLockOrders, MAX_LOCK_ORDERS_GRANT } from "@/lib/billing-lock-tools";
import { staffReasonSchema } from "@/lib/staff-reason";
import { notAnId } from "@/lib/route-id";

const bodySchema = z.object({
  orders: z.number().int().min(1).max(MAX_LOCK_ORDERS_GRANT),
  reason: staffReasonSchema,
});

/**
 * Give a locked store more storefront orders before it pauses (Fermi A1).
 * `extend_trial`, like extending a trial: support staff may grant free room
 * on the trial side. A store locked for an unpaid month needs
 * `manage_subscription` (super admins, who may also unlock it for free); the
 * database checks the lock's reason in the same step that adds the orders.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const result = await addLockOrders(
      createAdminClient(),
      id,
      parsed.data.orders,
      parsed.data.reason,
      auth.user,
      hasPermission(auth.role, "manage_subscription"),
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ id, orders_left: result.ordersLeft });
  } catch (error) {
    console.error("Add lock orders error:", error);
    return NextResponse.json({ error: "Failed to add store orders" }, { status: 500 });
  }
}
