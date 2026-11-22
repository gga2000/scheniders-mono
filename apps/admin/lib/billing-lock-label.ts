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
 * What opens a lock that renewal off made (20261119073654), in one clause that
 * every surface uses (round 21, structure new 6): the shop paying on its lock
 * screen (pay_billing_lock turns renewal back on and pays), or staff turning
 * renewal on while the wallet holds the month (the next hourly lock run
 * charges it). `priceIqd` names the month when the surface knows it.
 */
export function renewalOffOpens(priceIqd: number | null = null): string {
  const month = priceIqd === null ? "the month" : formatIQD(priceIqd);
  return `the shop pays ${month} on its lock screen, or staff turn renewal on and the wallet pays it`;
}

/** What stopping renewal does, said on the Renewal switch before it is pressed. */
export const RENEWAL_STOP_WORDS = `This month runs to its end. Then it is not charged, and the shop locks until ${renewalOffOpens()}.`;

/**
 * Staff's free time with renewal off: a free unlock (admin_force_unlock) and
 * free days this month (admin_extend_subscription) make the month active and
 * leave renewal off, so the daily renewal after that time locks the shop
 * again, uncharged.
 */
export const RENEWAL_OFF_THEN_LOCKS = "Renewal is off, so the shop locks again when that time ends.";

/** The same, named on a lock beside "Renewal is off": what a staff member with the free-time tools may also do. */
export const RENEWAL_OFF_FREE_TIME = "A free unlock or free days also open it, with no charge, for that time only.";

/**
 * What opens a lock, in one sentence: the shop page's status line and its lock
 * card say it the same way. Paying the month from the wallet opens it, except
 * that a paused shop is not charged until the pause lifts (settle_billing_lock
 * answers on_hold), and a month that ended with renewal off is charged by no
 * job (not_renewed): money alone never opens it. `staffFreeTime`: the viewer
 * may give a free unlock or free days, which open it too (both are refused
 * while the shop is paused).
 */
export function lockOpensWords(priceIqd: number, paused: boolean, renewalOff: boolean, staffFreeTime = false): string {
  const price = formatIQD(priceIqd);
  if (renewalOff) {
    const opens = `it opens when ${renewalOffOpens(priceIqd)}.`;
    if (paused) return `Paused, and renewal is off. Once the pause lifts, ${opens}`;
    const base = `Renewal is off, so money alone does not open it: ${opens}`;
    return staffFreeTime ? `${base} ${RENEWAL_OFF_FREE_TIME}` : base;
  }
  return paused
    ? `Paused, so the lock stays until the pause lifts. Then paying ${price} from the wallet opens it.`
    : `Paying ${price} from the wallet opens it again.`;
}
