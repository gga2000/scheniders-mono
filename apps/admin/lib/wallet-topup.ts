import { z } from "zod";
import { createAdminClient } from "./admin-supabase";
import { TOPUP_MAX_IQD } from "./topup-queue";

export const topupAmountSchema = z.number().int().positive().max(TOPUP_MAX_IQD);

/**
 * Made once by the browser for one top-up intent and sent again on a retry, so
 * a repeated request (double click, lost response, retry after a partial bulk
 * failure) credits the wallet once.
 */
export const topupRequestIdSchema = z.string().uuid();

const rpcResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    new_balance: z.coerce.number(),
    duplicate: z.boolean().optional(),
  }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type TopupResult =
  | { ok: true; newBalance: number; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Credit a tenant's prepaid wallet through the `admin_topup_wallet` RPC, which
 * locks the wallet row, updates balance + total_topped_up and writes the
 * 'topup' ledger row (with the acting admin) in one transaction. Never reads
 * the balance in JS, so concurrent top-ups cannot overwrite each other.
 *
 * `requestId` becomes the ledger reference `admin_topup:<request>:<tenant>`.
 * The RPC looks that reference up under the wallet row lock and answers
 * `duplicate` instead of crediting again; `uq_wallet_tx_admin_topup` backs it.
 */
export async function topUpWallet(params: {
  tenantId: string;
  amount: number;
  description: string;
  adminUserId: string;
  requestId: string;
}): Promise<TopupResult> {
  const { data, error } = await createAdminClient().rpc("admin_topup_wallet", {
    _tenant_id: params.tenantId,
    _amount: params.amount,
    _description: params.description,
    _created_by: params.adminUserId,
    _payment_method: "manual",
    _reference_id: `admin_topup:${params.requestId}:${params.tenantId}`,
  });

  if (error) return { ok: false, error: error.message };

  const parsed = rpcResultSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Unexpected top-up response" };
  if (!parsed.data.success) return { ok: false, error: parsed.data.error };
  return {
    ok: true,
    newBalance: parsed.data.new_balance,
    duplicate: parsed.data.duplicate === true,
  };
}
