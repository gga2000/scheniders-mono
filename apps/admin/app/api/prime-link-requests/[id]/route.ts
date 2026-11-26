import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({ shopId: z.number().int().positive().optional() }).nullable();
const answerSchema = z.object({ success: z.boolean(), error: z.string().optional() });

/** Why an approval could not link, as the bell shows it. */
const REFUSALS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Request not found" },
  already_linked: { status: 409, error: "Already linked" },
  not_resolved: { status: 409, error: "Prime has not linked this account to our system yet. Ask Prime first." },
  no_shop: { status: 409, error: "Pick the Prime shop first." },
  unknown_shop: { status: 400, error: "That shop is not on this Prime account." },
};

/**
 * POST /api/prime-link-requests/:id — approve a shop's Prime link (Fermi A3),
 * or a shop's request for a new Prime account (see the branch below).
 * Makes the link with the Prime account the merchant app found for it, even
 * when another shop uses that account; `shopId` picks the Prime shop when the
 * account has several. link_prime_request writes the link, closes the request
 * and tells the shop, in one transaction.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "link_prime");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const supabase = createAdminClient();
    // Read the shop for the staff log before anything changes.
    const { data: asked, error: askedError } = await supabase
      .from("prime_link_requests")
      .select("tenant_id, kind, outcome")
      .eq("id", id)
      .maybeSingle();
    if (askedError) throw askedError;

    // A new Prime account: approving lets the merchant app's prime-sync cron
    // create it at Prime and link the shop (within minutes). A refused account
    // (create_failed) is approved again once sorted with Prime.
    if (asked?.kind === "new") {
      if (asked.outcome !== "awaiting_approval" && asked.outcome !== "create_failed") {
        return NextResponse.json({ error: "This request is not waiting for approval." }, { status: 409 });
      }
      const { data: approved, error: approveError } = await supabase
        .from("prime_link_requests")
        .update({ approved_at: new Date().toISOString(), approved_by: auth.user.id, outcome: null, checked_at: null })
        .eq("id", id)
        .eq("kind", "new")
        .is("linked_at", null)
        .in("outcome", ["awaiting_approval", "create_failed"])
        .select("id");
      if (approveError) throw approveError;
      if (!approved?.length) return NextResponse.json({ error: "This request changed. Refresh and look again." }, { status: 409 });
      await logAdminAction(auth, "link_prime", { tenantId: asked.tenant_id, details: { request_id: id, new_account: true } });
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabase.rpc("link_prime_request", {
      _request_id: id,
      _shop_id: body.data?.shopId ?? null,
      _approved_by: auth.user.id,
    });
    if (error) throw error;
    const answer = answerSchema.parse(data);
    if (answer.success) {
      await logAdminAction(auth, "link_prime", {
        tenantId: asked?.tenant_id ?? null,
        details: { request_id: id, picked_shop_id: body.data?.shopId ?? null },
      });
      return NextResponse.json({ ok: true });
    }
    const refusal = REFUSALS[answer.error ?? ""] ?? { status: 409, error: "Could not link" };
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  } catch (error) {
    console.error("Prime link approve error:", error);
    return NextResponse.json({ error: "Failed to link the shop" }, { status: 500 });
  }
}
