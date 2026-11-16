import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

/** Interakt's own words when the platform's WhatsApp wallet is empty. */
const EMPTY_WALLET_ERROR = "%sufficient balance%";
/** Only recent sends matter, and the bound keeps the scan small on a big log. */
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * GET /api/whatsapp-health — is the platform's Interakt wallet empty? Every
 * shop sends through it (Ali, 9 Nov), so an empty wallet stops every shop's
 * messages at once. Interakt has no balance API; the sign is a refused send
 * that is newer than the last good one. Also how many shops are paused to
 * protect the shared number (whatsapp_sender_pauses, Fermi B2).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const [refused, sent, paused] = await Promise.all([
      supabase
        .from("whatsapp_logs")
        .select("created_at")
        .eq("direction", "outbound")
        .eq("status", "failed")
        .gte("created_at", since)
        .ilike("payload->>error", EMPTY_WALLET_ERROR)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("whatsapp_logs")
        .select("created_at")
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("whatsapp_sender_pauses")
        .select("tenant_id", { count: "exact", head: true })
        .is("resumed_at", null),
    ]);
    if (refused.error) throw refused.error;
    if (sent.error) throw sent.error;
    if (paused.error) throw paused.error;

    const refusedAt = refused.data?.created_at ?? null;
    const sentAt = sent.data?.created_at ?? null;
    const empty = refusedAt !== null && (sentAt === null || refusedAt > sentAt);
    return NextResponse.json({ interaktEmpty: empty, since: empty ? refusedAt : null, pausedShops: paused.count ?? 0 });
  } catch (error) {
    console.error("WhatsApp health API error:", error);
    return NextResponse.json({ error: "Failed to check WhatsApp" }, { status: 500 });
  }
}
