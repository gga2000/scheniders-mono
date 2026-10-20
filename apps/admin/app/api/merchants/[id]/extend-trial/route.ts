import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { z } from "zod";

const bodySchema = z.object({
  days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Same permission and the same rules as POST /api/trials/extend: trialing
  // tenants only, status never written (see lib/trial-extension.ts).
  const auth = await requireAdminPermission(request, "extend_trial");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const result = await extendTrial(createAdminClient(), id, parsed.data.days);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      id: result.tenantId,
      trial_ends_at: result.trialEndsAt,
      status: "trial",
    });
  } catch (error) {
    console.error("Extend trial error:", error);
    return NextResponse.json(
      { error: "Failed to extend trial" },
      { status: 500 }
    );
  }
}
