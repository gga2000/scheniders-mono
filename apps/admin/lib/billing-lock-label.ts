import { formatDay, formatIQD } from "@/lib/format";

/** The billing lock as the Merchants list carries it: why the shop is locked and since when. */
export type ListBillingLock = { reason: "trial_ended" | "unpaid"; since: string | null };

/** Why a shop is locked, in words: the Merchants list, the shop page and Needs us say it the same way. */
export const LOCK_REASON_WORDS: Readonly<Record<ListBillingLock["reason"], string>> = {
  trial_ended: "Trial ended, not paid",
  unpaid: "Month not paid",
};

const WORDS_BY_CODE: ReadonlyMap<string, string> = new Map(Object.entries(LOCK_REASON_WORDS));

/** A lock's reason code from the database in words; a code the console does not know is shown as written. */
export function lockReasonWords(code: string): string {
  return WORDS_BY_CODE.get(code) ?? code.replace(/_/g, " ");
}

/**
 * The lock and its reason in one line, for a list that names it among other
 * things (Health, Payments, the support card): "Locked: trial ended, not
 * paid", or "Locked since yesterday: month not paid" with `since`.
 */
export function lockedBecause(code: string | null, since = ""): string {
  return code ? `Locked${since}: ${lockReasonWords(code).toLowerCase()}` : `Locked${since}`;
}

/** "Trial ended, not paid. Locked since Sun 15 Nov." The day is the Baghdad day, as formatDay writes it. */
export function lockSentence(lock: ListBillingLock, now: Date = new Date()): string {
  const since = lock.since ? ` Locked since ${formatDay(lock.since, now)}.` : "";
  return `${LOCK_REASON_WORDS[lock.reason]}.${since}`;
}

/**
 * What opens a lock, in one sentence: the shop page's status line and its lock
 * card say it the same way. Paying the month from the wallet opens it, except
 * that a paused shop is not charged until the pause lifts (settle_billing_lock
 * answers on_hold), and a month that ended with renewal off is charged by no
 * job (not_renewed): money alone never opens it. The shop paying on its lock
 * screen turns renewal back on and pays (pay_billing_lock), or staff turn
 * renewal on and the wallet pays it (20261119073654_renewal_off_stops_charge).
 */
export function lockOpensWords(priceIqd: number, paused: boolean, renewalOff: boolean): string {
  const price = formatIQD(priceIqd);
  if (renewalOff) {
    const opens = `it opens when the shop pays ${price} on its lock screen, or when staff turn renewal on and the wallet pays it.`;
    return paused
      ? `Paused, and renewal is off. Once the pause lifts, ${opens}`
      : `Renewal is off, so money alone does not open it: ${opens}`;
  }
  return paused
    ? `Paused, so the lock stays until the pause lifts. Then paying ${price} from the wallet opens it.`
    : `Paying ${price} from the wallet opens it again.`;
}
