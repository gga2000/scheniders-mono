import { formatIQD } from "@/lib/format";
import { ATTENTION, ATTENTION_WALLET_IQD } from "@/lib/merchant-filters";
import type { MerchantsStats } from "@/hooks/use-merchants-stats";

export type DigestReason = "trials_expired" | "trials_today" | "suspended" | "low_wallet";

export interface DigestCard {
  reason: DigestReason;
  label: string;
  /** Shops with this reason. One shop can have two reasons, so the cards do not add up to `shops`. */
  count: number;
  /** The status filter the card sets: the list then holds the shops it counted. */
  status: string;
}

export interface MerchantsDigest {
  /** Shops on the "Needs attention" list: each counted once, by the database. */
  shops: number;
  cards: DigestCard[];
}

/**
 * What the banner above the Merchants list says. The headline is the
 * database's own count of shops that need attention, the same number as the
 * "Needs attention" pill, so a shop with an ended trial and an empty wallet is
 * one shop, not two. The cards are reasons, each with its own count.
 */
export function merchantsDigest(buckets: MerchantsStats["buckets"]): MerchantsDigest {
  const cards: DigestCard[] = [
    { reason: "trials_expired", label: "Trial expired", count: buckets.trials_expired, status: ATTENTION },
    { reason: "trials_today", label: "Trial ends today", count: buckets.trials_today, status: ATTENTION },
    { reason: "suspended", label: "Suspended", count: buckets.suspended, status: "suspended" },
    {
      reason: "low_wallet",
      label: `Wallet under ${formatIQD(ATTENTION_WALLET_IQD)}`,
      count: buckets.low_wallet,
      status: ATTENTION,
    },
  ];

  return { shops: buckets.attention, cards: cards.filter((card) => card.count > 0) };
}
