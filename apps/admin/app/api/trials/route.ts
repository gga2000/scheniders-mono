import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { readTrialShops, trialSummary } from "@/lib/trial-shops";

/**
 * The Trials page's list. The follow-up facts (orders, WhatsApp, Prime, the
 * one-trial check, the last call) have their own read, /api/trials/follow-up:
 * joined into this answer, a failed facts read the page does not show turned
 * the whole list into "Failed to fetch trials" (round 18).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const trials = await readTrialShops(createAdminClient(), new Date());
    return NextResponse.json({ trials, summary: trialSummary(trials) });
  } catch (error) {
    console.error("Trials API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trials" },
      { status: 500 }
    );
  }
}
