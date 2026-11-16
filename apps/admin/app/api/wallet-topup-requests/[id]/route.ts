import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { topupDecisionSchema } from "@/lib/topup-queue";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  outcome: z.string().nullable().optional(),
  credited: z.number().nullable().optional(),
  receipt_no: z.number().nullable().optional(),
});

/** The database's refusals that are the caller's to fix, as HTTP answers. */
const REFUSALS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Request not found" },
  bad_amount: { status: 400, error: "The amount must be between 1,000 and 10,000,000 IQD" },
  over_asked: { status: 403, error: "More than the shop sent needs a super admin" },
  reason_required: { status: 400, error: "Say why the receipt is refused (3 to 300 characters)" },
};

/**
 * POST /api/wallet-topup-requests/:id — our team checked a transfer receipt
 * (Fermi B3).
 *   { approve: true, amount? }  adds `amount` (what really arrived; the shop's
 *                                own figure when left out) to the wallet. A
 *                                credit that covers the plan unlocks a locked
 *                                shop at once, and the payment gets a receipt
 *                                number. More than the shop's own figure is a
 *                                plain top-up, so only a login that may top
 *                                up wallets (super admins) can add it.
 *   { approve: false, reason }  refuses it; the shop is told the reason and
 *                                can send again.
 * The database does all of it in one transaction, with the request as the
 * payment's key, so a double click never adds the money twice. A request
 * already decided is answered 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "check_payments");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  const parsed = topupDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send { approve: true, amount? } or { approve: false, reason }" },
      { status: 400 },
    );
  }
  const decision = parsed.data;

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
      _approve: decision.approve,
      _admin_id: auth.user.id,
      _amount: decision.approve ? decision.amount : undefined,
      _reason: decision.approve ? undefined : decision.reason,
      _may_add_more: hasPermission(auth.role, "top_up_wallet"),
    });
    if (error) throw error;
    const result = resultSchema.parse(data);
    if (result.success) {
      // The request row is the payment's own record (decided_by, decided_at).
      // This row puts the decision in the staff log too, with the shop and amount.
      await logAdminAction(auth, decision.approve ? "approve_topup_request" : "reject_topup_request", {
        tenantId: asked?.tenant_id ?? null,
        details: {
          request_id: id,
          amount_iqd: asked?.amount_iqd ?? null,
          method: asked?.method ?? null,
          outcome: result.outcome ?? null,
          ...(decision.approve
            ? { credited_iqd: result.credited ?? null, receipt_no: result.receipt_no ?? null }
            : { reason: decision.reason }),
        },
      });
      return NextResponse.json({
        ok: true,
        outcome: result.outcome ?? null,
        credited: result.credited ?? null,
        receipt_no: result.receipt_no ?? null,
      });
    }
    if (result.error === "already_decided") {
      return NextResponse.json({ error: "Request already decided", outcome: result.outcome ?? null }, { status: 409 });
    }
    const refusal = result.error ? REFUSALS[result.error] : undefined;
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    return NextResponse.json({ error: result.error ?? "Top-up failed" }, { status: 422 });
  } catch (error) {
    console.error("Wallet top-up decision error:", error);
    return NextResponse.json({ error: "Failed to decide the top-up request" }, { status: 500 });
  }
}
