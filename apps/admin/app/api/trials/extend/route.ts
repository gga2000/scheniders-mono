import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { staffReasonSchema, staffRequestIdSchema } from "@/lib/staff-reason";

const ExtendSchema = z.object({
  tenant_id: z.string().uuid(),
  days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS),
  reason: staffReasonSchema,
  request_id: staffRequestIdSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = ExtendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { tenant_id, days, reason, request_id } = parsed.data;
    const result = await extendTrial(createAdminClient(), tenant_id, days, reason, auth.user, request_id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      new_trial_ends_at: result.trialEndsAt,
      repeat: result.repeat,
    });
  } catch (error) {
    console.error("Extend trial error:", error);
    return NextResponse.json(
      { error: "Failed to extend trial" },
      { status: 500 }
    );
  }
}
