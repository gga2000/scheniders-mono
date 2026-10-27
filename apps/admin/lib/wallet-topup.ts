import { z } from "zod";
import { createAdminClient } from "./admin-supabase";

/** Bounds enforced again inside `admin_topup_wallet` (whole IQD, 1..10,000,000). */
export const TOPUP_MAX_IQD = 10_000_000;

export const topupAmountSchema = z.number().int().positive().max(TOPUP_MAX_IQD);

const rpcResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), new_balance: z.coerce.number() }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type TopupResult =
  | { ok: true; newBalance: number }
  | { ok: false; error: string };

/**
 * Credit a tenant's prepaid wallet through the `admin_topup_wallet` RPC, which
 * locks the wallet row, updates balance + total_topped_up and writes the
 * 'topup' ledger row (with the acting admin) in one transaction. Never reads
 * the balance in JS, so concurrent top-ups cannot overwrite each other.
 */
export async function topUpWallet(params: {
  tenantId: string;
  amount: number;
  description: string;
  adminUserId: string;
}): Promise<TopupResult> {
  const { data, error } = await createAdminClient().rpc("admin_topup_wallet", {
    _tenant_id: params.tenantId,
    _amount: params.amount,
    _description: params.description,
    _created_by: params.adminUserId,
    _payment_method: "manual",
  });

  if (error) return { ok: false, error: error.message };

  const parsed = rpcResultSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Unexpected top-up response" };
  if (!parsed.data.success) return { ok: false, error: parsed.data.error };
  return { ok: true, newBalance: parsed.data.new_balance };
}
