import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  expectedCostText,
  expectedMonthlyCost,
  trialReportFactsSchema,
  trialReportLead,
  trialReportLines,
  trialReportPeriod,
  trialReportText,
} from "@scheniders/shared/trial-report";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/merchants/[id]/trial-report: the shop's day-5 / end-of-trial
 * report (Fermi B12 item 2), as its facts, its lines and one WhatsApp message
 * the team can paste, in the same words the merchant reads in the app
 * (@scheniders/shared/trial-report). The staff who follow up trials may read
 * it; it changes nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "handle_support");
  if (auth instanceof NextResponse) return auth;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Invalid merchant id" }, { status: 400 });

  try {
    const { data, error } = await createAdminClient().rpc("admin_trial_report", { p_tenant: id.data });
    if (error) {
      if (error.code === "P0002") return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      throw error;
    }
    const facts = trialReportFactsSchema.parse(data);
    const cost = expectedMonthlyCost(facts);
    return NextResponse.json({
      facts,
      period: trialReportPeriod(facts),
      lead: trialReportLead(facts),
      lines: trialReportLines(facts),
      expectedCost: cost && { ...cost, ...expectedCostText(cost) },
      text: trialReportText(facts),
    });
  } catch (error) {
    console.error("Trial report API error:", error);
    return NextResponse.json({ error: "Failed to load the trial report" }, { status: 500 });
  }
}
