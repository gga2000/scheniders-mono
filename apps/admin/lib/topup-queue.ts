import { z } from "zod";
import { lockedBecause } from "@/lib/billing-lock-label";
import { STAFF_REASON_MIN, STAFF_REASON_TOO_SHORT, staffReasonLetters } from "@/lib/billing-lock-tools";
import { formatIQD } from "@/lib/format";
import { planLabel } from "@/types/admin";

/**
 * Shops that paid us by transfer and uploaded the receipt (Fermi B3). Read
 * from admin_topup_queue (20261116062511_fermi_qi_transfer_payments.sql): each
 * request with what staff need to decide it.
 */

/** The console's cache key for the queue (the page and the bell share it). */
export const TOPUP_QUEUE_KEY = ["admin", "wallet-topup-requests"] as const;

/** The least a shop's own transfer may be approved for: the merchant app's top-up minimum. */
export const TOPUP_MIN_IQD = 1_000;
/**
 * The least staff may add to a wallet by hand at once (Quick Top-Up, Add money
 * on a shop's page, bulk top-up). Ali's money rule, 23 Nov: 2,500 IQD, so a
 * typed "5" meant as 5,000 cannot go through.
 */
export const STAFF_TOPUP_MIN_IQD = 2_500;
/** The most IQD staff may add to a wallet at once; admin_topup_wallet checks it again. */
export const TOPUP_MAX_IQD = 10_000_000;
/** What one bulk top-up may add to each wallet: a whole number in IQD (the bulk route and dialog share it). */
export const bulkTopupAmountSchema = z.number().int().min(STAFF_TOPUP_MIN_IQD).max(TOPUP_MAX_IQD);
export const REJECT_REASON_MAX = 300;

const sameFileSchema = z.object({
  id: z.string().uuid(),
  display_id: z.number().int().nullable(),
  business_name: z.string().nullable(),
  outcome: z.enum(["approved", "rejected"]).nullable(),
  created_at: z.string(),
});

const billingSchema = z.object({
  locked: z.boolean(),
  reason: z.enum(["trial_ended", "unpaid"]).nullable(),
  plan: z.string().nullable(),
  price_iqd: z.coerce.number(),
  /** Renewal off: no job charges the month, so this payment alone does not open the lock (billing_lock_snapshot). */
  renewal_off: z.boolean(),
});

export const topupQueueRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  display_id: z.number().int().nullable(),
  business_name: z.string().nullable(),
  tenant_status: z.string(),
  amount_iqd: z.number().int(),
  method: z.enum(["zain_cash", "qi_card"]),
  receipt_path: z.string(),
  created_at: z.string(),
  balance_iqd: z.coerce.number(),
  /** Null for a shop without a tenant row's billing (never expected). */
  billing: billingSchema.nullable(),
  same_file: z.array(sameFileSchema),
  same_amount_recent: z.number().int(),
});

export const topupQueueSchema = z.object({ requests: z.array(topupQueueRowSchema) });

export type TopupQueueRow = z.infer<typeof topupQueueRowSchema>;

/** What the console receives: the row without its storage path, with a short-lived link. */
export const topupQueueItemSchema = topupQueueRowSchema
  .omit({ receipt_path: true })
  .extend({ receipt_url: z.string().nullable(), receipt_kind: z.enum(["image", "pdf"]) });
export type TopupQueueItem = z.infer<typeof topupQueueItemSchema>;

export function receiptKind(path: string): "image" | "pdf" {
  return path.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
}

/** Staff's decision: approve what really arrived, or refuse and say why. */
export const topupDecisionSchema = z.discriminatedUnion("approve", [
  z.object({
    approve: z.literal(true),
    amount: z.number().int().min(TOPUP_MIN_IQD).max(TOPUP_MAX_IQD).optional(),
  }),
  z.object({
    approve: z.literal(false),
    // At least 3 letters in any script, as the box's rule line says (round 21,
    // UX new 7): "Qi 12" is not a reason the shop can act on.
    reason: z
      .string()
      .trim()
      .max(REJECT_REASON_MAX)
      .refine((reason) => staffReasonLetters(reason) >= STAFF_REASON_MIN, STAFF_REASON_TOO_SHORT),
  }),
]);
export type TopupDecision = z.infer<typeof topupDecisionSchema>;

/**
 * What the shop still needs to pay to use its plan: the next payment minus the
 * wallet, when the shop is locked. Zero when it is not locked or the wallet
 * already covers it.
 */
export function amountStillOwed(row: Pick<TopupQueueRow, "billing" | "balance_iqd">): number {
  if (!row.billing?.locked) return 0;
  return Math.max(0, row.billing.price_iqd - row.balance_iqd);
}

/**
 * The locked chip on a payment: why it is locked and what opens it. A paused
 * shop's lock does not open with money until the pause lifts
 * (settle_billing_lock answers on_hold), and a short wallet still has to be
 * paid first, so a paused shop says both. With renewal off no money opens it:
 * the shop pays on its lock screen, or staff turn renewal on (round 20). Null
 * when the shop is not locked.
 */
export function lockedChip(row: Pick<TopupQueueRow, "billing" | "balance_iqd" | "tenant_status">): string | null {
  if (!row.billing?.locked) return null;
  const why = lockedBecause(row.billing.reason);
  if (row.billing.renewal_off) return `${why} · renewal off, so this payment alone does not open it`;
  const owed = amountStillOwed(row);
  if (row.tenant_status === "limited") {
    return owed > 0
      ? `${why} · paused; needs ${formatIQD(owed)}, then opens once the pause lifts`
      : `${why} · paused, opens once the pause lifts`;
  }
  return owed > 0 ? `${why} · needs ${formatIQD(owed)} to open` : `${why} · this payment opens it`;
}

/**
 * The shop's plan, next payment and wallet on a request's card, the plan in
 * the merchant's words ("Start plan", "Internal (no billing)").
 */
export function billingLine(row: Pick<TopupQueueRow, "billing" | "balance_iqd">): string {
  const plan = row.billing?.plan;
  const parts = [!plan ? "No plan" : plan === "internal" ? planLabel(plan) : `${planLabel(plan)} plan`];
  if (row.billing) parts.push(`next payment ${formatIQD(row.billing.price_iqd)}`);
  parts.push(`wallet ${formatIQD(row.balance_iqd)}`);
  return parts.join(" · ");
}

/** Why staff should look twice before approving, in plain words; empty when nothing stands out. */
export function topupWarnings(row: Pick<TopupQueueRow, "same_file" | "same_amount_recent" | "tenant_id">): string[] {
  const warnings: string[] = [];
  for (const other of row.same_file) {
    const shop = other.display_id ? `shop #${other.display_id}` : (other.business_name ?? "another shop");
    const state = other.outcome ?? "waiting";
    warnings.push(`Same receipt file as a request from ${shop} (${state})`);
  }
  if (row.same_amount_recent > 0) {
    warnings.push(
      `${row.same_amount_recent} other request${row.same_amount_recent === 1 ? "" : "s"} for the same amount from this shop within 7 days`,
    );
  }
  return warnings;
}

/** Where shops send the money, and what the printed receipt names (admin_settings 'topup_payment'). */
export const paymentDetailsSchema = z.object({
  qi_card: z.string().trim().max(40),
  qi_card_name: z.string().trim().max(80),
  zain_cash: z.string().trim().max(40),
  support_whatsapp: z.string().trim().max(20).regex(/^\+?\d*$/, "Digits only, with the country code (9647…)"),
  working_hours: z.string().trim().max(80),
  legal_name: z.string().trim().max(120),
});
export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = {
  qi_card: "",
  qi_card_name: "",
  zain_cash: "",
  support_whatsapp: "",
  working_hours: "",
  legal_name: "",
};

/** The stored setting, read leniently: a field that is missing or not text reads as empty. */
export function readPaymentDetails(value: unknown): PaymentDetails {
  const stored = z.record(z.string(), z.unknown()).safeParse(value);
  if (!stored.success) return EMPTY_PAYMENT_DETAILS;
  const pick = (key: keyof PaymentDetails) => (typeof stored.data[key] === "string" ? (stored.data[key] as string).trim() : "");
  return {
    qi_card: pick("qi_card"),
    qi_card_name: pick("qi_card_name"),
    zain_cash: pick("zain_cash"),
    support_whatsapp: pick("support_whatsapp"),
    working_hours: pick("working_hours"),
    legal_name: pick("legal_name"),
  };
}

const alreadyDecidedSchema = z.object({ outcome: z.enum(["approved", "rejected"]).nullable() });

/**
 * What staff are told when a receipt they decide was decided first, by a
 * colleague or by their own earlier click. The server answers 409 and
 * changes nothing; the page used to treat that as its own success and say
 * nothing.
 */
export function alreadyDecidedText(body: unknown): string {
  const parsed = alreadyDecidedSchema.safeParse(body);
  const outcome = parsed.success ? parsed.data.outcome : null;
  const done = outcome === "approved" ? "approved" : outcome === "rejected" ? "refused" : "decided";
  return `This receipt was already ${done}, so your decision changed nothing.`;
}
