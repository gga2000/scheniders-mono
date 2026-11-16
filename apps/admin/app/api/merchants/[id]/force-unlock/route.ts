import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { forceUnlock, MAX_FREE_UNLOCK_DAYS } from "@/lib/billing-lock-tools";
import { staffReasonSchema } from "@/lib/staff-reason";

const bodySchema = z.object({
  days: z.number().int().min(1).max(MAX_FREE_UNLOCK_DAYS),
  reason: staffReasonSchema,
});

/**
 * Unlock a locked store for free (Fermi A1): a paid period of `days` with no
 * wallet charge. `manage_subscription` (super admin): it grants paid time
 * without a payment, like extend-subscription.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "manage_subscription");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const result = await forceUnlock(
      createAdminClient(),
      id,
      parsed.data.days,
      parsed.data.reason,
      auth.user,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      id,
      status: "active",
      period_end: result.periodEnd,
      lock_reason: result.lockReason,
    });
  } catch (error) {
    console.error("Force unlock error:", error);
    return NextResponse.json({ error: "Failed to unlock the store" }, { status: 500 });
  }
}
