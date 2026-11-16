import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { SPIKE_WINDOW_MINUTES, findSpike, type SpikeMessage } from "@/lib/support-spike";

export const dynamic = "force-dynamic";

/** Enough for a busy half hour; a spike shows long before this many. */
const MESSAGE_LIMIT = 500;

/**
 * GET /api/support/spike — are several shops writing about the same thing
 * right now? Reads merchant messages from the last 30 minutes, the demo store
 * left out, and answers the biggest spike with a notice to start from.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const since = new Date(Date.now() - SPIKE_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("support_messages")
    .select("tenant_id, body, context, tenants!inner(is_demo)")
    .eq("sender_kind", "merchant")
    .eq("tenants.is_demo", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_LIMIT);
  if (error) {
    console.error("Support spike API error:", error);
    return NextResponse.json({ error: "Failed to check for a shared problem" }, { status: 500 });
  }

  return NextResponse.json({ spike: findSpike((data ?? []) as SpikeMessage[]) });
}
