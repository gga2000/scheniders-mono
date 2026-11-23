import { isStaffReason, STAFF_REASON_TOO_SHORT } from "./billing-lock-tools";
import { formatIQD } from "./format";
import { STAFF_TOPUP_MIN_IQD, TOPUP_MAX_IQD } from "./topup-queue";

export interface TopUpShop {
  business_name: string;
  balance_iqd: number;
}

export type QuickTopUpPlan =
  | { kind: "not_ready" }
  /** Something typed cannot go through: the words say what to change. */
  | { kind: "blocked"; words: string }
  | { kind: "ready"; amount: number; sentence: string; button: string };

/**
 * Why a whole amount cannot be added by hand, or null when it can: staff add
 * from STAFF_TOPUP_MIN_IQD to TOPUP_MAX_IQD at once. Quick Top-Up and Add
 * money on a shop's page say the same words the server answers.
 */
export function staffTopUpOutOfRange(amount: number): string | null {
  if (amount < STAFF_TOPUP_MIN_IQD) return `At least ${formatIQD(STAFF_TOPUP_MIN_IQD)} at once.`;
  if (amount > TOPUP_MAX_IQD) return `At most ${formatIQD(TOPUP_MAX_IQD)} at once.`;
  return null;
}

/**
 * What Billing's Quick Top-Up will do, said before the press (staff console
 * audit W-03). A slip on the shop list used to credit the wrong shop with no
 * word of which one: the line now names the shop, the amount and its wallet
 * now, and the button names the amount. The server takes whole IQD from
 * STAFF_TOPUP_MIN_IQD to TOPUP_MAX_IQD (lib/wallet-topup.ts).
 */
export function quickTopUpPlan(shop: TopUpShop | undefined, amount: number | "", reason: string): QuickTopUpPlan {
  // Nothing typed yet waits quietly; something typed that cannot go through
  // says why, so the grey button is never left without a word (audit r4-13).
  if (!shop || amount === "") return { kind: "not_ready" };
  if (!Number.isInteger(amount) || amount <= 0) return { kind: "blocked", words: "The amount is whole IQD, more than 0." };
  const outOfRange = staffTopUpOutOfRange(amount);
  if (outOfRange !== null) return { kind: "blocked", words: outOfRange };
  if (reason.trim() === "") return { kind: "not_ready" };
  if (!isStaffReason(reason)) return { kind: "blocked", words: STAFF_REASON_TOO_SHORT };
  return {
    kind: "ready",
    amount,
    sentence: `Adds ${formatIQD(amount)} to ${shop.business_name}. Its wallet holds ${formatIQD(shop.balance_iqd)} now.`,
    button: `Add ${formatIQD(amount)}`,
  };
}
