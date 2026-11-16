import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

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
 * POST /api/prime-link-requests/:id — approve a shop's Prime link (Fermi A3).
 * Makes the link with the Prime account the merchant app found for it, even
 * when another shop uses that account; `shopId` picks the Prime shop when the
 * account has several. link_prime_request writes the link, closes the request
 * and tells the shop, in one transaction.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "link_prime");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("link_prime_request", {
      _request_id: id,
      _shop_id: body.data?.shopId ?? null,
      _approved_by: auth.user.id,
    });
    if (error) throw error;
    const answer = answerSchema.parse(data);
    if (answer.success) return NextResponse.json({ ok: true });
    const refusal = REFUSALS[answer.error ?? ""] ?? { status: 409, error: "Could not link" };
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  } catch (error) {
    console.error("Prime link approve error:", error);
    return NextResponse.json({ error: "Failed to link the shop" }, { status: 500 });
  }
}
