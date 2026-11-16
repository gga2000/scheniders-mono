import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({ approve: z.boolean() });

const resultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  outcome: z.string().nullable().optional(),
});

/**
 * POST /api/wallet-topup-requests/:id { approve } — our team checked the
 * receipt. Approving adds the amount to the shop's wallet; either way the shop
 * is told in its notification feed. The database does all of it in one
 * transaction, with the request as the payment's key, so a double click never
 * adds the money twice. A request already decided is answered 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "top_up_wallet");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { approve: boolean }" }, { status: 400 });

  try {
    const supabase = createAdminClient();
    // Read for the staff log before anything changes: a read that fails here
    // stops the request while nothing has moved, never after the money has.
    const { data: asked, error: askedError } = await supabase
      .from("wallet_topup_requests")
      .select("tenant_id, amount_iqd, method")
      .eq("id", id)
      .maybeSingle();
    if (askedError) throw askedError;

    const { data, error } = await supabase.rpc("decide_wallet_topup_request", {
      _request_id: id,
      _approve: parsed.data.approve,
      _admin_id: auth.user.id,
    });
    if (error) throw error;
    const result = resultSchema.parse(data);
    if (result.success) {
      // The request row is the payment's own record (decided_by, decided_at).
      // This row puts the decision in the staff log too, with the shop and amount.
      await logAdminAction(auth, parsed.data.approve ? "approve_topup_request" : "reject_topup_request", {
        tenantId: asked?.tenant_id ?? null,
        details: {
          request_id: id,
          amount_iqd: asked?.amount_iqd ?? null,
          method: asked?.method ?? null,
          outcome: result.outcome ?? null,
        },
      });
      return NextResponse.json({ ok: true, outcome: result.outcome ?? null });
    }
    if (result.error === "not_found") return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (result.error === "already_decided") {
      return NextResponse.json({ error: "Request already decided", outcome: result.outcome ?? null }, { status: 409 });
    }
    return NextResponse.json({ error: result.error ?? "Top-up failed" }, { status: 422 });
  } catch (error) {
    console.error("Wallet top-up decision error:", error);
    return NextResponse.json({ error: "Failed to decide the top-up request" }, { status: 500 });
  }
}
