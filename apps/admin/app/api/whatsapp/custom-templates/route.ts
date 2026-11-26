import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { env } from "@/lib/admin-env";
import { CUSTOM_WA_HEADER_PATHS, customWaItemSchema, queueOrder } from "@/lib/custom-whatsapp-queue";

export const dynamic = "force-dynamic";

/** How far back the page shows requests that ended (approved, rejected, withdrawn…). */
const ENDED_DAYS = 30;
/** Ended requests shown at most; open ones are always all shown. */
const ENDED_LIMIT = 50;

const COLUMNS =
  "id, tenant_id, purpose, body, template_name, status, category, price_iqd, reason, created_at, sent_to_meta_at, decided_at, refunded_at, tenant:tenants(business_name, display_id)";

/**
 * GET /api/whatsapp/custom-templates — shops' paid custom WhatsApp messages:
 * every open one (waiting for us to submit it in Interakt, or for Meta), and
 * those decided in the last 30 days. Read by every active admin; moving one
 * along needs `review_whatsapp_templates`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - ENDED_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [open, ended] = await Promise.all([
      supabase.from("whatsapp_custom_templates").select(COLUMNS).in("status", ["review", "at_meta"]),
      supabase
        .from("whatsapp_custom_templates")
        .select(COLUMNS)
        .not("status", "in", "(review,at_meta)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(ENDED_LIMIT),
    ]);
    if (open.error) throw open.error;
    if (ended.error) throw ended.error;

    const items = z
      .array(customWaItemSchema)
      .parse([...(open.data ?? []), ...(ended.data ?? [])])
      .sort(queueOrder);
    const base = env.PLATFORM_URL?.replace(/\/+$/, "");
    const headerImages = base
      ? Object.fromEntries(Object.entries(CUSTOM_WA_HEADER_PATHS).map(([purpose, path]) => [purpose, `${base}${path}`]))
      : null;

    return NextResponse.json({ items, header_images: headerImages });
  } catch (error) {
    console.error("Custom WhatsApp messages API error:", error);
    return NextResponse.json({ error: "Failed to load the custom WhatsApp messages" }, { status: 500 });
  }
}
