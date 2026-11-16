import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { baghdadMonth, monthParamSchema, whatsappReportSchema, whatsappReportTotals } from "@/lib/whatsapp-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp?month=YYYY-MM — every shop's WhatsApp messages in one
 * Baghdad month: how many, what the shop paid, what the trial cost us, and
 * which shops are paused to protect the shared number (with their last
 * 24 hours of failures). Counted in the database, one answer.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const param = new URL(request.url).searchParams.get("month") ?? baghdadMonth(new Date());
  const month = monthParamSchema.safeParse(param);
  if (!month.success) {
    return NextResponse.json({ error: month.error.issues[0]?.message ?? "Invalid month" }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("admin_whatsapp_report", { p_month: `${month.data}-01` });
    if (error) throw error;
    const report = whatsappReportSchema.parse(data);
    return NextResponse.json({ month: month.data, ...report, totals: whatsappReportTotals(report.shops) });
  } catch (error) {
    console.error("WhatsApp report API error:", error);
    return NextResponse.json({ error: "Failed to load the WhatsApp report" }, { status: 500 });
  }
}
