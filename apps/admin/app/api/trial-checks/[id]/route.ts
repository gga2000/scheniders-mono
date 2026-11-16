import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { decideTrialCheck, trialCheckDecisionSchema } from "@/lib/trial-checks";

/**
 * Decide a flagged store (Fermi B5): give its trial back for some days, end
 * its trial now, or mark it checked. Each takes a reason for the staff log,
 * which admin_trial_check_decide writes in the same transaction.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "review_trials");
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }

    const parsed = trialCheckDecisionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await decideTrialCheck(createAdminClient(), id, parsed.data, auth.user);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, decision: result.decision });
  } catch (error) {
    console.error("Trial check decision error:", error);
    return NextResponse.json({ error: "Failed to save the decision" }, { status: 500 });
  }
}
