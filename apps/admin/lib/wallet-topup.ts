import { z } from "zod";
import { createAdminClient } from "./admin-supabase";
import { formatIQD } from "./format";
import { STAFF_TOPUP_MIN_IQD, TOPUP_MAX_IQD } from "./topup-queue";

export const topupAmountSchema = z
  .number()
  .int()
  .min(STAFF_TOPUP_MIN_IQD, `At least ${formatIQD(STAFF_TOPUP_MIN_IQD)} at once.`)
  .max(TOPUP_MAX_IQD, `At most ${formatIQD(TOPUP_MAX_IQD)} at once.`);

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
  /** `error` is for staff to read; the database's own words stay in the server log. */
  | { ok: false; noWallet: boolean; error: string };

/** The database answers this when the shop has no wallet row. */
const NO_WALLET = "No wallet found";
export const TOPUP_NO_WALLET = "This shop has no wallet yet, so nothing was added.";
/**
 * The call failed or its answer was lost. The request id makes a retry add the
 * money once at most; the browser keeps that id for an hour (round 21), so
 * that is where and when staff are told a retry is safe.
 */
export const TOPUP_NOT_CONFIRMED = "The top-up could not be confirmed. Check the wallet before trying again: a retry from this browser within the hour adds it once at most.";

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

  if (error) {
    console.error("[wallet-topup] admin_topup_wallet failed:", params.tenantId, error.message);
    return { ok: false, noWallet: false, error: TOPUP_NOT_CONFIRMED };
  }

  const parsed = rpcResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[wallet-topup] unexpected answer:", params.tenantId, parsed.error.message);
    return { ok: false, noWallet: false, error: TOPUP_NOT_CONFIRMED };
  }
  if (!parsed.data.success) {
    if (parsed.data.error === NO_WALLET) return { ok: false, noWallet: true, error: TOPUP_NO_WALLET };
    console.error("[wallet-topup] refused:", params.tenantId, parsed.data.error);
    return { ok: false, noWallet: false, error: TOPUP_NOT_CONFIRMED };
  }
  return {
    ok: true,
    newBalance: parsed.data.new_balance,
    duplicate: parsed.data.duplicate === true,
  };
}
