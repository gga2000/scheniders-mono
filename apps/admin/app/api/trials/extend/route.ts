import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { staffReasonSchema } from "@/lib/staff-reason";

const ExtendSchema = z.object({
  tenant_id: z.string().uuid(),
  days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS),
  reason: staffReasonSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = ExtendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tenant_id, days, reason } = parsed.data;
    const result = await extendTrial(createAdminClient(), tenant_id, days, reason, auth.user);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      new_trial_ends_at: result.trialEndsAt,
    });
  } catch (error) {
    console.error("Extend trial error:", error);
    return NextResponse.json(
      { error: "Failed to extend trial" },
      { status: 500 }
    );
  }
}
