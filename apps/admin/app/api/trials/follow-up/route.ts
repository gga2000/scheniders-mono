import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { trialGroups, trialPipelineSchema, type TrialFollowUp } from "@/lib/trial-pipeline";
import { readTrialShops } from "@/lib/trial-shops";

/**
 * Every shop on trial with its follow-up facts and follow-up groups
 * (lib/trial-pipeline), for the trial follow-up screen. The facts are
 * counted in the database for every trial in one answer. A failed or
 * misshapen read answers 500, never a list of zeros; the Trials list
 * (/api/trials) does not wait on it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [shops, pipeline] = await Promise.all([
      readTrialShops(supabase, new Date()),
      supabase.rpc("admin_trial_pipeline").then(({ data, error }) => {
        if (error) throw error;
        return trialPipelineSchema.parse(data);
      }),
    ]);
    const followUps = new Map<string, TrialFollowUp>(pipeline.map((facts) => [facts.tenant_id, facts]));

    // follow_up is null only for a shop that started its trial between the
    // two reads: the next refresh has it.
    const trials = shops.map((shop) => {
      const row = { ...shop, follow_up: followUps.get(shop.id) ?? null };
      return { ...row, groups: trialGroups(row) };
    });
    return NextResponse.json({ trials });
  } catch (error) {
    console.error("Trial follow-up API error:", error);
    return NextResponse.json({ error: "Failed to fetch the trial follow-up facts" }, { status: 500 });
  }
}
