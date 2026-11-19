import { isStaffReason } from "./billing-lock-tools";
import { formatIQD } from "./format";
import { TOPUP_MAX_IQD } from "./topup-queue";

export interface TopUpShop {
  business_name: string;
  balance_iqd: number;
}

export type QuickTopUpPlan =
  | { kind: "not_ready" }
  | { kind: "too_much"; words: string }
  | { kind: "ready"; amount: number; sentence: string; button: string };

/**
 * What Billing's Quick Top-Up will do, said before the press (staff console
 * audit W-03). A slip on the shop list used to credit the wrong shop with no
 * word of which one: the line now names the shop, the amount and its wallet
 * now, and the button names the amount. The server takes whole IQD up to
 * TOPUP_MAX_IQD (lib/wallet-topup.ts).
 */
export function quickTopUpPlan(shop: TopUpShop | undefined, amount: number | "", reason: string): QuickTopUpPlan {
  if (!shop || amount === "" || !Number.isInteger(amount) || amount <= 0) return { kind: "not_ready" };
  if (amount > TOPUP_MAX_IQD) return { kind: "too_much", words: `At most ${formatIQD(TOPUP_MAX_IQD)} at once.` };
  if (!isStaffReason(reason)) return { kind: "not_ready" };
  return {
    kind: "ready",
    amount,
    sentence: `Adds ${formatIQD(amount)} to ${shop.business_name}. Its wallet holds ${formatIQD(shop.balance_iqd)} now.`,
    button: `Add ${formatIQD(amount)}`,
  };
}
